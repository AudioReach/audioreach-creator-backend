/**
 * Metadata for ACDB chunk types.
 * Defines dependencies, characteristics, and descriptions for each chunk type.
 */
export interface ChunkTypeMetadata {
  /** Chunk type identifier */
  type: string;
  /** List of chunk types this chunk depends on */
  dependencies: string[];
  /** Whether this chunk is commonly used by multiple other chunks */
  isCommon: boolean;
  /** Human-readable description of the chunk */
  description: string;
}

/**
 * Static registry of chunk type metadata.
 * Provides centralized metadata for all ACDB chunk types without needing
 * to instantiate chunk objects.
 *
 * Benefits:
 * - No dummy chunk creation needed
 * - O(1) lookup complexity
 * - Centralized metadata management
 * - Easy to extend with new chunk types
 * - Type-safe at compile time
 */
export class ChunkMetadataRegistry {
  private static metadata: Map<string, ChunkTypeMetadata> = new Map([
    [
      'HEADER',
      {
        type: 'HEADER',
        dependencies: [],
        isCommon: true,
        description: 'File header with version and metadata',
      },
    ],
    [
      'METADATA',
      {
        type: 'METADATA',
        dependencies: ['HEADER'],
        isCommon: true,
        description: 'Project metadata and configuration',
      },
    ],
    [
      'MODULE',
      {
        type: 'MODULE',
        dependencies: ['HEADER', 'METADATA'],
        isCommon: false,
        description: 'Audio processing module definition',
      },
    ],
    [
      'SUBGRAPH',
      {
        type: 'SUBGRAPH',
        dependencies: ['HEADER', 'MODULE'],
        isCommon: false,
        description: 'Audio processing subgraph',
      },
    ],
    [
      'CONTAINER',
      {
        type: 'CONTAINER',
        dependencies: ['HEADER'],
        isCommon: false,
        description: 'Container definition',
      },
    ],
    // Add more chunk types as they are implemented
  ]);

  /**
   * Get metadata for a specific chunk type
   * @param chunkType - The chunk type identifier
   * @returns Chunk metadata if found, undefined otherwise
   */
  static getMetadata(chunkType: string): ChunkTypeMetadata | undefined {
    return this.metadata.get(chunkType);
  }

  /**
   * Get dependencies for a specific chunk type
   * @param chunkType - The chunk type identifier
   * @returns Array of chunk types this chunk depends on
   */
  static getDependencies(chunkType: string): string[] {
    return this.metadata.get(chunkType)?.dependencies || [];
  }

  /**
   * Check if a chunk type is commonly used by other chunks
   * @param chunkType - The chunk type identifier
   * @returns true if chunk is marked as common, false otherwise
   */
  static isCommonChunk(chunkType: string): boolean {
    return this.metadata.get(chunkType)?.isCommon || false;
  }

  /**
   * Get all registered chunk types
   * @returns Array of all chunk type identifiers
   */
  static getAllChunkTypes(): string[] {
    return Array.from(this.metadata.keys());
  }

  /**
   * Register a new chunk type (for extensibility)
   * @param metadata - Metadata for the new chunk type
   */
  static registerChunkType(metadata: ChunkTypeMetadata): void {
    this.metadata.set(metadata.type, metadata);
  }

  /**
   * Check if a chunk type is registered
   * @param chunkType - The chunk type identifier
   * @returns true if chunk type is registered, false otherwise
   */
  static hasChunkType(chunkType: string): boolean {
    return this.metadata.has(chunkType);
  }

  /**
   * Get description for a chunk type
   * @param chunkType - The chunk type identifier
   * @returns Description if found, undefined otherwise
   */
  static getDescription(chunkType: string): string | undefined {
    return this.metadata.get(chunkType)?.description;
  }
}
