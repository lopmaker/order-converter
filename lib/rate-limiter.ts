
// lib/rate-limiter.ts

interface RateLimitOptions {
  interval: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests allowed within the interval
}

interface RequestRecord {
  timestamp: number; // Timestamp of the request
  count: number;     // Number of requests in the current window
}

const defaultOptions: RateLimitOptions = {
  interval: 60 * 1000, // 1 minute
  maxRequests: 5,      // 5 requests per minute
};

// In-memory storage for rate limiting
const rateLimitStore = new Map<string, RequestRecord>();

export class RateLimiter {
  private options: RateLimitOptions;

  constructor(options?: Partial<RateLimitOptions>) {
    this.options = { ...defaultOptions, ...options };
  }

  /**
   * Checks if a request from the given identifier (e.g., IP address) should be rate-limited.
   * @param identifier A unique string identifying the client (e.g., IP address).
   * @returns true if the request is allowed, false if it's rate-limited.
   */
  public check(identifier: string): boolean {
    const now = Date.now();
    const record = rateLimitStore.get(identifier);

    if (!record || now - record.timestamp > this.options.interval) {
      // No record, or the interval has passed, reset the counter
      rateLimitStore.set(identifier, { timestamp: now, count: 1 });
      return true; // Allowed
    } else {
      // Within the interval, increment count
      record.count++;
      rateLimitStore.set(identifier, record); // Update the record

      if (record.count <= this.options.maxRequests) {
        return true; // Allowed
      } else {
        return false; // Rate-limited
      }
    }
  }

  /**
   * Gets the remaining requests allowed for a given identifier within the current window.
   * @param identifier A unique string identifying the client.
   * @returns The number of remaining requests, or 0 if rate-limited.
   */
  public getRemaining(identifier: string): number {
    const now = Date.now();
    const record = rateLimitStore.get(identifier);

    if (!record || now - record.timestamp > this.options.interval) {
      return this.options.maxRequests; // Full capacity if window reset or no record
    } else {
      return Math.max(0, this.options.maxRequests - record.count);
    }
  }

  /**
   * Gets the time in seconds until the rate limit resets for a given identifier.
   * @param identifier A unique string identifying the client.
   * @returns The reset time in seconds, or 0 if no active limit.
   */
  public getResetTime(identifier: string): number {
    const now = Date.now();
    const record = rateLimitStore.get(identifier);

    if (!record || now - record.timestamp > this.options.interval) {
      return 0; // No active limit, or window has reset
    } else {
      const timeLeft = record.timestamp + this.options.interval - now;
      return Math.ceil(timeLeft / 1000); // Convert to seconds and round up
    }
  }
}

// Export a default instance for common usage
export const pdfParseRateLimiter = new RateLimiter({
  maxRequests: 5, // Allow 5 PDF parsing requests
  interval: 60 * 1000, // Per minute
});
