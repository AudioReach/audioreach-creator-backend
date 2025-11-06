/**
 * Specific input structure for chunk parsing tasks
 */
export interface ChunkParseInput {
  /** Type of chunk to parse (e.g., 'HEADER') */
  chunkType: string;

  /** Raw chunk data bytes */
  chunkData: Uint8Array;
}

/**
 * Specific context structure for chunk parsing tasks
 */
export interface ChunkParseContextData {
  /** Serialized dependency data from previously parsed chunks */
  dependencies: Record<string, unknown>;
}
