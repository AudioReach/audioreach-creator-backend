/**
 * Abstract base class for all ACDB chunk types.
 * Chunks are pure data structures representing parsed sections of an ACDB file.
 *
 * Note: Chunk dependencies are now managed by ChunkMetadataRegistry
 * instead of being properties on chunk instances.
 */
export abstract class BaseChunk {
  /** Unique identifier for this chunk type (e.g., 'HEADER', 'METADATA') */
  abstract readonly chunkType: string;
}
