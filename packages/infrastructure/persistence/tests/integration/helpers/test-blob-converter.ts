import {BlobBytesConverter} from '../../../src/persistence-typeorm-sqllite/entity-schema/usecase-data/module/helper/blob-unit8array.converter.js';

/**
 * Test implementation of BlobBytesConverter for integration tests
 * Handles conversion between Uint8Array and database blob formats for SQLite
 */
export class TestBlobConverter implements BlobBytesConverter {
  /**
   * Convert Uint8Array to database SQL format
   * @param value - The Uint8Array to convert
   * @returns Buffer for SQLite storage, or null if input is null/undefined
   */
  toSql(value: Uint8Array | null | undefined): unknown {
    if (value === null || value === undefined) {
      return null;
    }
    // For SQLite in-memory database, we can store as Buffer
    return Buffer.from(value);
  }

  /**
   * Convert database SQL value to Uint8Array
   * @param value - The database value to convert
   * @returns Uint8Array or null
   */
  fromSql(value: unknown): Uint8Array | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (value instanceof Uint8Array) {
      return value;
    }
    if (value instanceof Buffer) {
      return new Uint8Array(value);
    }
    if (Array.isArray(value)) {
      return new Uint8Array(value);
    }
    // Handle other blob formats if needed
    return new Uint8Array(value as ArrayBuffer);
  }
}
