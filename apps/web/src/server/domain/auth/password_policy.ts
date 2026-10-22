/**
 * Password Policy (FR-AUTH-02, NIST SP 800-63B)
 * - Minimum 12 characters, maximum 128 characters
 * - No composition rules (no mandatory upper/lower/digit/symbol)
 * - Paste and spaces permitted
 */
export interface PasswordValidationResult {
  valid: boolean;
  reason?: string;
}

export function validatePassword(password: string): PasswordValidationResult {
  if (typeof password !== 'string') {
    return {
      valid: false,
      reason: 'Password must be a valid string',
    };
  }

  if (password.length < 12) {
    return {
      valid: false,
      reason: 'Password must be at least 12 characters long',
    };
  }

  if (password.length > 128) {
    return {
      valid: false,
      reason: 'Password cannot exceed 128 characters',
    };
  }

  return { valid: true };
}
