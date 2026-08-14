import pino from "pino";

export function createLogger(level = "info") {
  return pino({
    level,
    redact: {
      paths: ["lineUserId", "*.lineUserId", "accessToken", "*.accessToken", "apiKey", "*.apiKey", "private_key", "*.private_key"],
      censor: "[REDACTED]"
    }
  });
}

export type Logger = ReturnType<typeof createLogger>;
