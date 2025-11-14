/**
 * Chunk type constants for ACDB files.
 * Centralized string constants to avoid magic strings and provide type safety.
 */
export const CHUNK_TYPES = {
  HEADER: 'HEAD',
  DATAPOOL: 'POOL',
  GKV_TABLE: 'GKVT',
  GKV_LUT: 'GKVL',
  SUBGRAPH_CONNECTION_LUT: 'SCLU',
  SUBGRAPH_CONNECTION_DEF: 'SCDE',
  SUBGRAPH_CONNECTION_DOT: 'SCDO',

  // Derived chunk types (virtual - not in binary file)
  SUBGRAPH_DATA: 'SUBGRAPH_DATA',
} as const;

/**
 * Union type of all valid chunk types
 */
export type ChunkType = (typeof CHUNK_TYPES)[keyof typeof CHUNK_TYPES];

/**
 * Array of all chunk types for iteration
 */
export const ALL_CHUNK_TYPES = Object.values(CHUNK_TYPES);
