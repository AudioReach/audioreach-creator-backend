import type {ChunkMetadata} from '../services/parsers/models/chunk-metadata.js';

/**
 * Custom error class for ACDB file validation errors.
 * Includes error codes for programmatic handling.
 */
export class AcdbFileValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'AcdbFileValidationError';
  }
}

/**
 * Validator for ACDB file structure and content.
 * Provides comprehensive validation to catch corrupted or malformed files early.
 */
export class AcdbFileValidator {
  /**
   * Validate complete ACDB file structure and content.
   * Add specific validation logic as needed.
   *
   * @param bytes - Raw file bytes to validate
   * @throws AcdbFileValidationError if validation fails
   */
  static validate(bytes: Uint8Array): void {
    // Basic file size validation
    if (bytes.length < 16) {
      throw new AcdbFileValidationError(
        `File too small: ${bytes.length} bytes (minimum 16)`,
        'FILE_TOO_SMALL',
      );
    }

    // Add more validations here as needed:
    // - Magic number validation
    // - Version compatibility check
    // - Checksum validation
    // - etc.
  }

  /**
   * Validate chunk descriptors.
   * Add specific validation logic as needed.
   *
   * @param descriptors - Chunk descriptors to validate
   * @param fileSize - Total file size
   * @throws AcdbFileValidationError if chunk descriptors are invalid
   */
  static validateChunkDescriptors(
    descriptors: ChunkMetadata[],
    fileSize: number,
  ): void {
    // Basic chunk count validation
    if (descriptors.length === 0) {
      throw new AcdbFileValidationError('No chunks found in file', 'NO_CHUNKS');
    }

    // Add more validations here as needed:
    // - Validate each chunk descriptor (type, offset, length)
    // - Check for overlapping chunks
    // - Verify chunks don't exceed file size
    // - Ensure required chunks are present
    // - etc.
    void fileSize; // Suppress unused parameter warning until implemented
  }
}
