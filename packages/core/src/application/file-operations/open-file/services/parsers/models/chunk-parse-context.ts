import type {BaseChunk} from '../chunks/base-chunk.js';

/**
 * Context provided to chunks during parsing, containing results from dependent chunks
 */
export interface ChunkParseContext {
  /** Map of chunk type to parsed chunk instance for dependency resolution */
  dependencies: Map<string, BaseChunk>;
}
