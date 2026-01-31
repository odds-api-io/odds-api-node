/**
 * Custom error classes for Odds-API.io client
 */

/**
 * Base error class for all Odds-API.io errors
 */
export class OddsAPIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OddsAPIError';
    Object.setPrototypeOf(this, OddsAPIError.prototype);
  }
}

/**
 * Thrown when the API key is invalid or missing
 */
export class InvalidAPIKeyError extends OddsAPIError {
  constructor(message: string = 'Invalid API key') {
    super(message);
    this.name = 'InvalidAPIKeyError';
    Object.setPrototypeOf(this, InvalidAPIKeyError.prototype);
  }
}

/**
 * Thrown when rate limit is exceeded
 */
export class RateLimitExceededError extends OddsAPIError {
  constructor(message: string = 'Rate limit exceeded - please wait before retrying') {
    super(message);
    this.name = 'RateLimitExceededError';
    Object.setPrototypeOf(this, RateLimitExceededError.prototype);
  }
}

/**
 * Thrown when a resource is not found (404)
 */
export class NotFoundError extends OddsAPIError {
  constructor(message: string = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Thrown when request times out
 */
export class TimeoutError extends OddsAPIError {
  constructor(message: string = 'Request timeout') {
    super(message);
    this.name = 'TimeoutError';
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Thrown when network request fails
 */
export class NetworkError extends OddsAPIError {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}
