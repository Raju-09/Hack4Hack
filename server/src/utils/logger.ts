import { env } from "../config/env.js";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const REDACTED_KEYS = new Set([
  "password", "passwordHash", "token", "accessToken", "refreshToken",
  "cookie", "authorization", "code", "codeHash", "secret", "jwt",
]);

function redact(obj: unknown, depth = 0): unknown {
  if (depth > 5) return "[deep]";
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((v) => redact(v, depth + 1));

  const sanitised: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    sanitised[k] = REDACTED_KEYS.has(k.toLowerCase()) ? "[REDACTED]" : redact(v, depth + 1);
  }
  return sanitised;
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  if (LEVELS[level] < LEVELS[env.LOG_LEVEL as LogLevel]) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(meta ? redact(meta) as object : {}),
  };

  const output = JSON.stringify(entry);
  if (level === "error") {
    process.stderr.write(output + "\n");
  } else {
    process.stdout.write(output + "\n");
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log("debug", msg, meta),
  info:  (msg: string, meta?: Record<string, unknown>) => log("info",  msg, meta),
  warn:  (msg: string, meta?: Record<string, unknown>) => log("warn",  msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta),
};
