/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHUNK_TYPES} from '../../shared/constants/chunk-types.js';
import type {BaseChunk} from '../../shared/acdb-chunks/base-chunk.js';
import {HeaderChunk} from '../../shared/acdb-chunks/header-chunk.js';
import {DatapoolChunk} from '../../shared/acdb-chunks/datapool-chunk.js';
import {UsecaseDataChunk} from '../../shared/acdb-chunks/usecase-data-chunk.js';
import {SubgraphDataChunk} from '../../shared/acdb-chunks/subgraph-data-chunk.js';
import {SubgraphPairDataChunk} from '../../shared/acdb-chunks/subgraph-pair-data-chunk.js';
import type {ChunkParseContext} from '../models/chunk-parse-context.js';
import {HeaderChunkParser} from './acdb-chunk-parsers/header-chunk-parser.js';
import {DatapoolChunkParser} from './acdb-chunk-parsers/datapool-chunk-parser.js';
import {UsecaseDataChunkParser} from './acdb-chunk-parsers/usecase-data-chunk-parser.js';
import {SubgraphDataChunkParser} from './acdb-chunk-parsers/subgraph-data-chunk-parser.js';
import {SubgraphPairDataChunkParser} from './acdb-chunk-parsers/subgraph-pair-data-chunk-parser.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';

/**
 * Service responsible for parsing individual ACDB chunks.
 * Contains all chunk parsing business logic.
 */
export class AcdbParser {
  private readonly headerParser = new HeaderChunkParser();
  private readonly datapoolParser = new DatapoolChunkParser();
  private readonly usecaseDataParser = new UsecaseDataChunkParser();
  private readonly subgraphDataParser: SubgraphDataChunkParser;
  private readonly subgraphPairDataParser = new SubgraphPairDataChunkParser();

  constructor(logger?: Logger) {
    this.subgraphDataParser = new SubgraphDataChunkParser(logger);
  }

  /**
   * Parse a single chunk based on its type
   * All raw data (including main chunk) is now provided in context.rawChunks
   */
  parseChunk(chunkType: string, context: ChunkParseContext): BaseChunk {
    switch (chunkType) {
      case CHUNK_TYPES.HEADER:
        return this.parseHeaderChunk(context);
      case CHUNK_TYPES.DATAPOOL:
        return this.parseDatapoolChunk(context);
      case CHUNK_TYPES.GKV_TABLE:
        return this.parseUsecaseDataChunk(context);
      case CHUNK_TYPES.SUBGRAPH_DATA:
        return this.parseSubgraphDataChunk(context);
      case CHUNK_TYPES.SUBGRAPH_CONNECTION_LUT:
        return this.parseSubgraphPairDataChunk(context);
      default:
        throw new Error(`Unknown chunk type: ${chunkType}`);
    }
  }

  /**
   * Parse HEADER chunk using HeaderChunkParser
   */
  private parseHeaderChunk(context: ChunkParseContext): HeaderChunk {
    return this.headerParser.parse(context);
  }

  /**
   * Parse DATAPOOL chunk using DatapoolChunkParser
   */
  private parseDatapoolChunk(context: ChunkParseContext): DatapoolChunk {
    return this.datapoolParser.parse(context);
  }

  /**
   * Parse GKV_TABLE chunk using UsecaseDataChunkParser
   */
  private parseUsecaseDataChunk(context: ChunkParseContext): UsecaseDataChunk {
    return this.usecaseDataParser.parse(context);
  }

  /**
   * Parse SUBGRAPH_DATA chunk using SubgraphDataChunkParser
   * Note: This is a derived chunk that works with parsed chunks from context, not raw binary data
   */
  private parseSubgraphDataChunk(
    context: ChunkParseContext,
  ): SubgraphDataChunk {
    return this.subgraphDataParser.parse(context);
  }

  /**
   * Parse SUBGRAPH_CONNECTION_LUT chunk using SubgraphPairDataChunkParser
   */
  private parseSubgraphPairDataChunk(
    context: ChunkParseContext,
  ): SubgraphPairDataChunk {
    return this.subgraphPairDataParser.parse(context);
  }
}
