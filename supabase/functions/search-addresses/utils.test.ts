import { sanitizeLimit } from "./utils.ts"

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected} but got ${actual}`)
  }
}

Deno.test('sanitizeLimit falls back for invalid numbers', () => {
  assertEquals(sanitizeLimit('abc'), 5)
  assertEquals(sanitizeLimit(-1), 5)
})

Deno.test('sanitizeLimit accepts valid numbers', () => {
  assertEquals(sanitizeLimit(3), 3)
})

Deno.test('postcode-only queries are detected', () => {
  const hasPostcode = /[A-Z]{1,2}[0-9]{1,2} ?[0-9][A-Z]{2}/i.test('SW1 1AA')
  assertEquals(hasPostcode, true)
})
