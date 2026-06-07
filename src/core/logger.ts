type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// In production emit JSON for log aggregators (Datadog, CloudWatch, etc.).
// In development emit a human-readable format with colour hints.
const IS_PROD = process.env.NODE_ENV === "production";
const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? (IS_PROD ? "info" : "debug");

const shouldLog = (level: LogLevel): boolean =>
  LEVEL_ORDER[level] >= LEVEL_ORDER[MIN_LEVEL];

const formatProd = (level: LogLevel, msg: string, meta?: Record<string, unknown>): string =>
  JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...(meta && Object.keys(meta).length ? { meta } : {}),
  });

const formatDev = (level: LogLevel, msg: string, meta?: Record<string, unknown>): string => {
  const prefix = new Date().toISOString();
  const tag = `[${level.toUpperCase()}]`.padEnd(7);
  const metaStr = meta && Object.keys(meta).length ? " " + JSON.stringify(meta) : "";
  return `${prefix} ${tag} ${msg}${metaStr}`;
};

// Extract the first plain-string argument as the message;
// gather remaining args into a meta object for structured output.
const buildEntry = (
  args: unknown[]
): { msg: string; meta: Record<string, unknown> } => {
  const [first, ...rest] = args;
  const msg = typeof first === "string" ? first : JSON.stringify(first);

  const meta: Record<string, unknown> = {};
  rest.forEach((a, i) => {
    if (a instanceof Error) {
      meta[`err${i || ""}`] = { message: a.message, stack: a.stack, name: a.name };
    } else if (a !== null && typeof a === "object") {
      Object.assign(meta, a as Record<string, unknown>);
    } else if (a !== undefined) {
      meta[`arg${i}`] = a;
    }
  });

  return { msg, meta };
};

const log = (level: LogLevel, args: unknown[]): void => {
  if (!shouldLog(level)) return;
  const { msg, meta } = buildEntry(args);
  const line = IS_PROD ? formatProd(level, msg, meta) : formatDev(level, msg, meta);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
};

export const logger = {
  debug: (...args: unknown[]): void => log("debug", args),
  info:  (...args: unknown[]): void => log("info",  args),
  warn:  (...args: unknown[]): void => log("warn",  args),
  error: (...args: unknown[]): void => log("error", args),
};
