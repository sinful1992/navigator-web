export function sanitizeLimit(value: unknown, fallback = 5): number {
  const num = Number(value)
  return Number.isFinite(num) && num >= 1 ? num : fallback
}
