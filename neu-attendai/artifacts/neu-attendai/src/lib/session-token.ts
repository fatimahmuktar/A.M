/**
 * Session Token Generator
 *
 * Produces a time-based 6-digit code that rotates every TOKEN_WINDOW_SECONDS.
 * Both the professor QR display and the student code-entry use the same algorithm,
 * so they always agree without a server round-trip.
 *
 * Security note: this is a prototype HOTP-style scheme.
 * Production deployments should use a proper TOTP library (e.g. otplib) with
 * a shared secret stored server-side.
 */

const TOKEN_WINDOW_SECONDS = 300; // 5-minute rotation window

/** djb2 hash — fast, deterministic, no crypto dependency required */
function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // force 32-bit integer
  }
  return hash;
}

export interface TokenData {
  code: string;
  window: number;
  expiresAt: number;
  secondsLeft: number;
}

/**
 * Generate the current 6-digit token for a given session ID.
 * The token changes automatically when the 2-minute window rolls over.
 */
export function generateSessionToken(sessionId: string): TokenData {
  const nowSec       = Math.floor(Date.now() / 1000);
  const currentWindow = Math.floor(nowSec / TOKEN_WINDOW_SECONDS);
  const expiresAtSec  = (currentWindow + 1) * TOKEN_WINDOW_SECONDS;
  const secondsLeft   = expiresAtSec - nowSec;

  const hash = djb2(`${sessionId}-${currentWindow}`);
  const code = String(Math.abs(hash) % 1_000_000).padStart(6, "0");

  return {
    code,
    window:    currentWindow,
    expiresAt: expiresAtSec * 1000,
    secondsLeft,
  };
}

/** Returns true if the student-entered code matches the current token. */
export function validateSessionCode(sessionId: string, inputCode: string): boolean {
  return inputCode.trim() === generateSessionToken(sessionId).code;
}

/**
 * Returns how far through the current window we are (0 → 1).
 * Used to animate the countdown ring on the QR display.
 */
export function getWindowProgress(): number {
  const nowSec  = Math.floor(Date.now() / 1000);
  const elapsed = nowSec % TOKEN_WINDOW_SECONDS;
  return elapsed / TOKEN_WINDOW_SECONDS;
}
