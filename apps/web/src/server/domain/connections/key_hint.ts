/**
 * The only trace of a pasted key that is ever shown again: a short prefix and the
 * last four characters (`xnd_…s9fK`). Enough for a person to tell two keys apart,
 * far too little to use. A key too short to hide anything behind shows only its
 * last four, so a short secret is never mostly visible.
 */
export function keyHint(secret: string): string {
  const value = secret.trim();
  const tail = value.slice(-4);
  if (value.length < 12) return `…${tail}`;
  return `${value.slice(0, 4)}…${tail}`;
}
