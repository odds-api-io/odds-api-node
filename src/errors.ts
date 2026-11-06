import type { RateLimitInfo } from './types.js';

export interface OddsAPIErrorDetails {
  status?: number;
  /** The raw response body. */
  body?: string;
  rateLimit?: RateLimitInfo;
}

/** Base class for every error the SDK throws. `message` is the server's own error text when there is one. */
export class OddsAPIError extends Error {
  readonly status?: number;
  readonly body?: string;
  readonly rateLimit?: RateLimitInfo;

  constructor(message: string, details: OddsAPIErrorDetails = {}) {
    super(message);
    this.name = 'OddsAPIError';
    this.status = details.status;
    this.body = details.body;
    this.rateLimit = details.rateLimit;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 400: a parameter is missing or invalid. */
export class BadRequestError extends OddsAPIError {
  constructor(message = 'Bad request', details: OddsAPIErrorDetails = {}) {
    super(message, { status: 400, ...details });
    this.name = 'BadRequestError';
  }
}

/** 401: the API key is invalid or missing. */
export class InvalidAPIKeyError extends OddsAPIError {
  constructor(message = 'Invalid API key', details: OddsAPIErrorDetails = {}) {
    super(message, { status: 401, ...details });
    this.name = 'InvalidAPIKeyError';
  }
}

/**
 * 403: the key's plan does not include this endpoint or bookmaker, or it lacks
 * an add-on such as Outrights. The message says which, with a link to fix it.
 */
export class ForbiddenError extends OddsAPIError {
  constructor(message = 'Forbidden', details: OddsAPIErrorDetails = {}) {
    super(message, { status: 403, ...details });
    this.name = 'ForbiddenError';
  }

  /** True when the 403 is about a paid add-on (for example Outrights). */
  get isAddOnRequired(): boolean {
    return /add-on/i.test(this.message);
  }
}

/** 404: the resource does not exist. The message often lists what does. */
export class NotFoundError extends OddsAPIError {
  constructor(message = 'Resource not found', details: OddsAPIErrorDetails = {}) {
    super(message, { status: 404, ...details });
    this.name = 'NotFoundError';
  }
}

/** 429: rate limit reached. */
export class RateLimitError extends OddsAPIError {
  /** Seconds to wait before retrying, from Retry-After or the rate-limit reset header. */
  readonly retryAfter?: number;

  constructor(
    message = 'Rate limit exceeded',
    details: OddsAPIErrorDetails & { retryAfter?: number } = {}
  ) {
    super(message, { status: 429, ...details });
    this.name = 'RateLimitError';
    this.retryAfter = details.retryAfter;
  }
}

/** @deprecated Use `RateLimitError`; this is the same class. */
export const RateLimitExceededError = RateLimitError;
/** @deprecated Use `RateLimitError`. */
export type RateLimitExceededError = RateLimitError;

/** 5xx: the server failed or is busy. */
export class ServerError extends OddsAPIError {
  /** Seconds the server asked to wait (Retry-After), when it sent one. */
  readonly retryAfter?: number;

  constructor(message = 'Server error', details: OddsAPIErrorDetails & { retryAfter?: number } = {}) {
    super(message, details);
    this.name = 'ServerError';
    this.retryAfter = details.retryAfter;
  }
}

/** The request took longer than the configured timeout. */
export class TimeoutError extends OddsAPIError {
  constructor(message = 'Request timeout') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/** The request never reached the server or the connection failed. */
export class NetworkError extends OddsAPIError {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}
