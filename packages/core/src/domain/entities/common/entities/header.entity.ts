/**
 * Header entity representing ACDB file metadata.
 * Created from HeaderChunk during Phase 2 domain assembly.
 */
export class HeaderEntity {
  constructor(
    public readonly version: string,
    public readonly fileSize: number,
    public readonly chunkCount: number,
    public readonly createdAt: Date = new Date(),
  ) {
    this.validate();
  }

  private validate(): void {
    if (!this.version || this.version.length === 0) {
      throw new Error('Header version is required');
    }
    if (this.fileSize <= 0) {
      throw new Error('File size must be positive');
    }
    if (this.chunkCount <= 0) {
      throw new Error('Chunk count must be positive');
    }
  }

  /**
   * Check if this header is compatible with another version
   */
  isCompatibleWith(otherVersion: string): boolean {
    return this.version === otherVersion;
  }

  /**
   * Serialize entity to plain object
   */
  toJSON() {
    return {
      version: this.version,
      fileSize: this.fileSize,
      chunkCount: this.chunkCount,
      createdAt: this.createdAt.toISOString(),
    };
  }

  /**
   * Create entity from plain object (for deserialization)
   */
  static fromJSON(data: any): HeaderEntity {
    return new HeaderEntity(
      data.version,
      data.fileSize,
      data.chunkCount,
      new Date(data.createdAt),
    );
  }
}
