import type {BlobBytesConverter} from '@arc/persistence';

export class NodeBlobBytesConverter implements BlobBytesConverter {
  /**
   * Convert Uint8Array to database format (Buffer for Node.js/SQLite)
   * @param value - Uint8Array from application
   * @returns Buffer for database storage, or null
   */
  toSql(value: Uint8Array | null | undefined): Buffer | null {
    if (value == null) return null;
    // Convert Uint8Array to Buffer for SQLite BLOB storage
    return Buffer.from(value);
  }

  /**
   * Convert database format (Buffer) back to Uint8Array
   * @param value - Buffer from database (SQLite BLOB)
   * @returns Uint8Array for application use, or null
   */
  fromSql(value: unknown): Uint8Array | null {
    if (value == null) {
      return null;
    }

    // Handle Buffer from SQLite
    if (Buffer.isBuffer(value)) {
      return new Uint8Array(value);
    }

    // Handle potential ArrayBuffer (edge case)
    if (value instanceof ArrayBuffer) {
      return new Uint8Array(value);
    }

    // Handle Uint8Array (already correct format)
    if (value instanceof Uint8Array) {
      return value;
    }

    // Fallback: try to convert array-like objects
    if (
      Array.isArray(value) ||
      (typeof value === 'object' && 'length' in value)
    ) {
      try {
        return new Uint8Array(value as ArrayLike<number>);
      } catch (error) {
        console.warn('Failed to convert blob data to Uint8Array:', error);
        return null;
      }
    }

    console.warn('Unexpected blob data type:', typeof value, value);
    return null;
  }
}
