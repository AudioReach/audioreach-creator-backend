import {BaseChunk} from './base-chunk.js';
import {CHUNK_TYPES} from '../../../constants/chunk-types.js';

/**
 * Represents a single subgraph data entry extracted from usecase data
 */
export interface SubgraphDataEntry {
  /** Extracted subgraph properties data */
  properties: Uint8Array;
}

/**
 * Derived chunk containing subgraph data extracted from usecase entries.
 * This chunk is generated after parsing GKV_TABLE and DATAPOOL chunks,
 * by extracting subgraph properties from the datapool using sgPropOffset values.
 *
 * Dependencies: GKV_TABLE, DATAPOOL (parsed chunks, not raw binary data)
 */
export class SubgraphDataChunk extends BaseChunk {
  readonly chunkType = CHUNK_TYPES.SUBGRAPH_DATA;

  /** Array of extracted subgraph data entries */
  subgraphData: SubgraphDataEntry[] = [];

  /**
   * Add a subgraph data entry to the chunk
   */
  addSubgraphData(entry: SubgraphDataEntry): void {
    this.subgraphData.push(entry);
  }

  /**
   * Get all subgraph data entries
   */
  getAllSubgraphData(): SubgraphDataEntry[] {
    return [...this.subgraphData];
  }

  /**
   * Get the total number of subgraph data entries
   */
  getSubgraphDataCount(): number {
    return this.subgraphData.length;
  }

  /**
   * Clear all subgraph data entries
   */
  clearSubgraphData(): void {
    this.subgraphData = [];
  }
}
