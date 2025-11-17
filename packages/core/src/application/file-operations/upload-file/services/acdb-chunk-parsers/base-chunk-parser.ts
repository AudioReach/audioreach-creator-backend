import type {BaseChunk} from '../../../shared/acdb-chunks/base-chunk.js';
import type {ChunkParseContext} from '../../models/chunk-parse-context.js';

/**
 * Abstract base class for chunk parser factories.
 * Each factory knows how to parse a specific chunk type.
 *
 * This follows the same pattern as BaseEntityBuilder for consistency.
 */
export abstract class BaseChunkParser<T extends BaseChunk = BaseChunk> {
  /** Unique identifier for the chunk type this parser handles */
  abstract readonly chunkType: string;

  /**
   * Parse chunk from context
   * @param context - Parse context with raw chunks and parsed dependencies
   * @returns Parsed chunk instance
   */
  abstract parse(context: ChunkParseContext): T;
}
