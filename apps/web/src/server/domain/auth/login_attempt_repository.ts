export interface LoginAttemptRepository {
  /**
   * Records a login attempt for a hashed identifier (email hash).
   */
  recordAttempt(emailHash: string, ipAddress: string, successful: boolean): Promise<void>;

  /**
   * Returns the number of consecutive failed attempts since the last success.
   */
  getConsecutiveFailures(emailHash: string): Promise<number>;

  /**
   * Returns the count of previous lockouts (e.g. how many times lockout threshold 5 was reached).
   */
  getLockoutHistoryCount(emailHash: string): Promise<number>;

  /**
   * Clears failure attempts for the identifier upon successful login.
   */
  clearAttempts(emailHash: string): Promise<void>;
}
