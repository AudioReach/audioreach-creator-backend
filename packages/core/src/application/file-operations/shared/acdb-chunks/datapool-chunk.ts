import {BaseChunk} from './base-chunk.js';
import {CHUNK_TYPES} from '../constants/chunk-types.js';

/**
 * Datapool chunk containing payload data from ACDB file.
 * Optimized for structuredClone and worker transfers.
 * Contains only data properties to ensure efficient structuredClone operations
 */
export class DatapoolChunk extends BaseChunk {
  readonly chunkType = CHUNK_TYPES.DATAPOOL;

  /** Payload data in file order */
  payloads!: Uint8Array[];

  /** File offsets corresponding to each payload */
  offsets!: number[];

  /** Total length of the chunk */
  totalLength!: number;
}
