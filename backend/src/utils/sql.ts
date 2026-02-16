/**
 * Escape SQL LIKE/ILIKE metacharacters in user input.
 * Prevents `%` (match-all) and `_` (single-char wildcard) from being
 * interpreted as pattern characters when used inside ILIKE expressions.
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&');
}
