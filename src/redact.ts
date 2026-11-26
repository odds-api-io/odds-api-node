/**
 * Keeps the API key out of error messages, stacks and `cause` chains. The key
 * travels as the `apiKey` query parameter, and some fetch and WebSocket
 * implementations put the request URL into their error messages.
 */

const REDACTED = '***';
const SECRET_PARAM =
  /(^|[^A-Za-z0-9_])(api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password|key)(=|%3D)[^&#\s'"<>()[\],;]+/gi;
const SECRET_HEADER = /((?:x-)?api[_-]?key|authorization)(['"]?\s*:\s*['"]?)(?:bearer\s+|basic\s+)?[^'"\s,}&]+/gi;
const MAX_DEPTH = 8;

type Secrets = readonly (string | undefined)[];

function variants(secrets: Secrets): string[] {
  const found = new Set<string>();
  for (const secret of secrets) {
    if (!secret) continue;
    found.add(secret);
    found.add(encodeURIComponent(secret));
    found.add(encodeURIComponent(secret).replace(/%20/g, '+'));
  }
  return [...found].sort((a, b) => b.length - a.length);
}

/** `text` with the given secrets and any key-like query parameter or header masked. */
export function redactSecrets(text: string, secrets: Secrets = []): string {
  let out = text;
  for (const secret of variants(secrets)) out = out.split(secret).join(REDACTED);
  out = out.replace(SECRET_PARAM, (_m, pre: string, name: string, eq: string) => `${pre}${name}${eq}${REDACTED}`);
  return out.replace(SECRET_HEADER, (_m, name: string, sep: string) => `${name}${sep}${REDACTED}`);
}

function redactValue(value: unknown, secrets: Secrets, depth: number): unknown {
  if (typeof value === 'string') return redactSecrets(value, secrets);
  if (value instanceof Error) return redactError(value, secrets, depth + 1);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, secrets, depth + 1));
  if (value instanceof URL) return redactSecrets(value.toString(), secrets);
  return value;
}

/**
 * A copy of `error` (same prototype, so `instanceof` still works) whose message,
 * stack, string properties and whole `cause` chain have the secrets masked.
 */
export function redactError<T>(error: T, secrets: Secrets, depth = 0): T {
  if (typeof error === 'string') return redactSecrets(error, secrets) as T;
  if (!(error instanceof Error) || depth > MAX_DEPTH) return error;
  const copy = Object.create(Object.getPrototypeOf(error)) as Error;
  for (const key of Object.getOwnPropertyNames(error)) {
    const descriptor = Object.getOwnPropertyDescriptor(error, key);
    if (!descriptor) continue;
    if ('value' in descriptor) descriptor.value = redactValue(descriptor.value, secrets, depth);
    else if (descriptor.get) {
      const value = redactValue((error as any)[key], secrets, depth);
      Object.defineProperty(copy, key, { value, enumerable: descriptor.enumerable, configurable: true, writable: true });
      continue;
    }
    Object.defineProperty(copy, key, descriptor);
  }
  return copy as T;
}
