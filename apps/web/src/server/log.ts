import "server-only";

type Fields = Record<string, unknown>;
const REDACT = /pass(word)?|token|secret|authorization|cookie|service_role|key$/i;

function redact(fields: Fields): Fields {
  const out: Fields = {};
  for (const [k, v] of Object.entries(fields)) out[k] = REDACT.test(k) ? "[redacted]" : v;
  return out;
}

function write(level: "info" | "warn" | "error", msg: string, fields: Fields = {}) {
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg, ...redact(fields) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Structured JSON logs to stdout. Never pass secrets; known secret-like keys are redacted anyway. */
export const log = {
  info: (msg: string, fields?: Fields) => write("info", msg, fields),
  warn: (msg: string, fields?: Fields) => write("warn", msg, fields),
  error: (msg: string, fields?: Fields) => write("error", msg, fields),
};
