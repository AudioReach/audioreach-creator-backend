import {CHUNK_TYPES} from '../../shared/constants/chunk-types.js';
import type {BaseChunk} from '../../shared/acdb-chunks/base-chunk.js';
import {HeaderChunk} from '../../shared/acdb-chunks/header-chunk.js';
import {DatapoolChunk} from '../../shared/acdb-chunks/datapool-chunk.js';
import {UsecaseDataChunk} from '../../shared/acdb-chunks/usecase-data-chunk.js';
import {SubgraphDataChunk} from '../../shared/acdb-chunks/subgraph-data-chunk.js';
import type {ChunkParseContext} from '../models/chunk-parse-context.js';
import {HeaderChunkParser} from './acdb-chunk-parsers/header-chunk-parser.js';
import {DatapoolChunkParser} from './acdb-chunk-parsers/datapool-chunk-parser.js';
import {UsecaseDataChunkParser} from './acdb-chunk-parsers/usecase-data-chunk-parser.js';
import {SubgraphDataChunkParser} from './acdb-chunk-parsers/subgraph-data-chunk-parser.js';

/**
 * Service responsible for parsing individual ACDB chunks.
 * Contains all chunk parsing business logic.
 */
export class AcdbParser {
  private readonly headerParser = new HeaderChunkParser();
  private readonly datapoolParser = new DatapoolChunkParser();
  private readonly usecaseDataParser = new UsecaseDataChunkParser();
  private readonly subgraphDataParser = new SubgraphDataChunkParser();

  /**
   * Parse a single chunk based on its type
   */
  parseChunk(
    chunkType: string,
    data: Uint8Array,
    context: ChunkParseContext,
  ): BaseChunk {
    switch (chunkType) {
      case CHUNK_TYPES.HEADER:
        return this.parseHeaderChunk(data, context);
      case CHUNK_TYPES.DATAPOOL:
        return this.parseDatapoolChunk(data, context);
      case CHUNK_TYPES.GKV_TABLE:
        return this.parseUsecaseDataChunk(data, context);
      case CHUNK_TYPES.SUBGRAPH_DATA:
        return this.parseSubgraphDataChunk(data, context);
      default:
        throw new Error(`Unknown chunk type: ${chunkType}`);
    }
  }

  /**
   * Parse HEADER chunk using HeaderChunkParser
   */
  private parseHeaderChunk(
    data: Uint8Array,
    context: ChunkParseContext,
  ): HeaderChunk {
    // Create chunk group with just the header chunk
    const chunkGroup = [
      {
        chunkType: CHUNK_TYPES.HEADER,
        chunkData: data,
      },
    ];

    return this.headerParser.parse(chunkGroup, context);
  }

  /**
   * Parse DATAPOOL chunk using DatapoolChunkParser
   */
  private parseDatapoolChunk(
    data: Uint8Array,
    context: ChunkParseContext,
  ): DatapoolChunk {
    // Create chunk group with just the datapool chunk
    const chunkGroup = [
      {
        chunkType: CHUNK_TYPES.DATAPOOL,
        chunkData: data,
      },
    ];

    return this.datapoolParser.parse(chunkGroup, context);
  }

  /**
   * Parse GKV_TABLE chunk using UsecaseDataChunkParser
   * Note: This method is called by AcdbFileOrchestrator which provides chunk groups with dependencies
   */
  private parseUsecaseDataChunk(
    data: Uint8Array,
    context: ChunkParseContext,
  ): UsecaseDataChunk {
    // For now, create a minimal chunk group with just GKV_TABLE
    // The AcdbFileOrchestrator will handle providing the full chunk group with dependencies
    const chunkGroup = [
      {
        chunkType: CHUNK_TYPES.GKV_TABLE,
        chunkData: data,
      },
    ];

    return this.usecaseDataParser.parse(chunkGroup, context);
  }

  /**
   * Parse SUBGRAPH_DATA chunk using SubgraphDataChunkParser
   * Note: This is a derived chunk that works with parsed chunks from context, not raw binary data
   */
  private parseSubgraphDataChunk(
    _data: Uint8Array,
    context: ChunkParseContext,
  ): SubgraphDataChunk {
    // For derived chunks, we don't use raw data - pass empty chunk group
    const chunkGroup: Array<{chunkType: string; chunkData: Uint8Array}> = [];
    return this.subgraphDataParser.parse(chunkGroup, context);
  }
}
