/**
 * Metadata describing a chunk's location and type within an ACDB file
 */
export type ChunkMetadata = {
  /** Unique identifier/type of the chunk (e.g., 'HEADER', 'METADATA') */
  type: string;

  /** Byte offset where the chunk starts in the file */
  offset: number;

  /** Length of the chunk data in bytes */
  length: number;
};
