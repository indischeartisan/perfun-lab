export function errorWithCause(message: string, cause: unknown) {
  return new Error(message, { cause })
}
