/**
 * Keeps the API key out of error messages, stacks and `cause` chains. The key
 * travels as the `apiKey` query parameter, and some fetch and WebSocket
 * implementations put the request URL into their error messages.
 */

const REDACTED = '***';
const SECRET_PARAM =
  /(^|[^A-Za-z0-9_])(api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password|key)(=|%3D)[^&#\s'"<>()[\],;]+/gi;
const SECRET_HEADER = /((?:x-)?api[_-]?key|authorization)(['"]?\s*:\s*['"]?)(?:bearer\s+|basic\s+)?[^'"\s,}&]+/gi;
const SECRET_FIELD =
  /^(?:x-)?(?:api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password|authorization|proxy-authorization)$/i;
const MAX_DEPTH = 8;
const TRUNCATED = '[truncated]';

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

function read(source: object, key: string): unknown {
  try {
    return (source as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

class Redactor {
  private readonly seen = new WeakMap<object, unknown>();

  constructor(private readonly secrets: Secrets) {}

  value(value: unknown, depth: number): unknown {
    if (typeof value === 'string') return redactSecrets(value, this.secrets);
    if (value === null || typeof value !== 'object') return typeof value === 'function' ? undefined : value;
    if (depth > MAX_DEPTH) return TRUNCATED;
    if (this.seen.has(value)) return this.seen.get(value);
    if (value instanceof Error || isErrorLike(value)) return this.error(value as Error, depth);
    if (Array.isArray(value)) {
      const out: unknown[] = [];
      this.seen.set(value, out);
      for (const item of value) out.push(this.value(item, depth + 1));
      return out;
    }
    if (value instanceof URL) return redactSecrets(value.toString(), this.secrets);
    if (!isPlainObject(value)) {
      const name = (value as object).constructor?.name ?? 'Object';
      return `[${name}]`;
    }
    const out: Record<string, unknown> = {};
    this.seen.set(value, out);
    for (const key of Object.keys(value)) this.copyField(out, value, key, depth);
    return out;
  }

  private copyField(target: object, source: object, key: string, depth: number): void {
    const value = read(source, key);
    const name = redactSecrets(key, this.secrets);
    (target as Record<string, unknown>)[name] =
      SECRET_FIELD.test(key) && value ? REDACTED : this.value(value, depth + 1);
  }

  /** A plain `Error` copy: same name, masked message, stack and properties, masked `cause` chain. */
  error(error: Error, depth: number): Error {
    const message = read(error, 'message');
    const copy = new Error(redactSecrets(typeof message === 'string' ? message : '', this.secrets));
    this.seen.set(error, copy);
    const name = read(error, 'name');
    if (typeof name === 'string') copy.name = name;
    const stack = read(error, 'stack');
    Object.defineProperty(copy, 'stack', {
      value: typeof stack === 'string' ? redactSecrets(stack, this.secrets) : undefined,
      writable: true,
      configurable: true,
    });
    for (const key of ['code', 'errno', 'syscall', 'hostname', 'address', 'port', 'status', 'statusCode', 'type']) {
      const value = read(error, key);
      if (value !== undefined && typeof value !== 'object') (copy as any)[key] = this.value(value, depth + 1);
    }
    for (const key of Object.keys(error)) {
      if (key in copy) continue;
      this.copyField(copy, error, key, depth);
    }
    const cause = read(error, 'cause');
    if (cause !== undefined) {
      Object.defineProperty(copy, 'cause', {
        value: this.value(cause, depth + 1),
        writable: true,
        configurable: true,
      });
    }
    const errors = read(error, 'errors');
    if (Array.isArray(errors)) (copy as any).errors = this.value(errors, depth + 1);
    return copy;
  }
}

function isErrorLike(value: object): boolean {
  return typeof read(value, 'message') === 'string' && typeof read(value, 'name') === 'string' && 'stack' in value;
}

/**
 * A plain `Error` copy of `error` whose message, stack, properties and whole
 * `cause` chain have the secrets masked. Strings are masked; anything else
 * that is not an error, array or plain object is reduced to its type name.
 */
export function redactError(error: unknown, secrets: Secrets): unknown {
  return new Redactor(secrets).value(error, 0);
}
