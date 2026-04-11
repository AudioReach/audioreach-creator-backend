export function assertNonNull<T>(
  value: T,
  message?: string,
): asserts value is NonNullable<T> {
  if (value == null) {
    throw new TypeError(message ?? 'Value must not be null or undefined');
  }
}

/**
 * Asserts that a condition is truthy.
 * Throws if the condition is false.
 */
export function invariant(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
