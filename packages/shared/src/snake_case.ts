export function toSnakeCase(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s\-]+/g, '_')
    .toLowerCase();
}

export function isSnakeCaseKey(key: string): boolean {
  return /^[a-z0-9_]+$/.test(key);
}

export function assertSnakeCaseKeys(record: Record<string, unknown>): boolean {
  return Object.keys(record).every((key) => isSnakeCaseKey(key));
}
