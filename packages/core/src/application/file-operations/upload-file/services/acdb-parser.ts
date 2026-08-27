/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {PARSED_CHUNK_TYPES} from '../../shared/constants/chunk-types.js';
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
import {VoiceCalibrationChunkParser} from './acdb-chunk-parsers/voice-calibration-chunk-parser.js';
import {AudioCalibrationChunkParser} from './acdb-chunk-parsers/audio-calibration-chunk-parser.js';
import {TagDataChunkParser} from './acdb-chunk-parsers/tag-data-chunk-parser.js';
import {TaggedModuleMapChunkParser} from './acdb-chunk-parsers/tagged-module-map-chunk-parser.js';
import {DriverCalibrationChunkParser} from './acdb-chunk-parsers/driver-calibration-chunk-parser.js';
import {
  BootUpLoadingChunkParser,
  type BootUpLoadingChunk,
} from './acdb-chunk-parsers/bootup-loading-chunk-parser.js';
import {
  ModuleManagerChunkParser,
  type ModuleManagerChunk,
} from './acdb-chunk-parsers/module-manager-chunk-parser.js';
import {GkvAliasChunkParser} from './acdb-chunk-parsers/gkv-alias-chunk-parser.js';
import type {GkvAliasChunk} from '../../shared/acdb-chunks/gkv-alias-chunk.js';
import {VoiceCalibrationChunk} from '../../shared/acdb-chunks/voice-calibration-chunk.js';
import {AudioCalibrationChunk} from '../../shared/acdb-chunks/audio-calibration-chunk.js';
import {TagDataChunk} from '../../shared/acdb-chunks/tag-data-chunk.js';
import {TaggedModuleMapChunk} from '../../shared/acdb-chunks/tagged-module-map-chunk.js';
import {DriverCalibrationChunk} from '../../shared/acdb-chunks/driver-calibration-chunk.js';
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
  private readonly voiceCalibrationParser: VoiceCalibrationChunkParser;
  private readonly audioCalibrationParser: AudioCalibrationChunkParser;
  private readonly tagDataParser: TagDataChunkParser;
  private readonly taggedModuleMapParser: TaggedModuleMapChunkParser;
  private readonly driverCalibrationParser: DriverCalibrationChunkParser;
  private readonly bootUpLoadingParser: BootUpLoadingChunkParser;
  private readonly moduleManagerParser: ModuleManagerChunkParser;
  private readonly gkvAliasParser = new GkvAliasChunkParser();
  private readonly logger?: Logger;

  constructor(logger?: Logger) {
    this.logger = logger;
    this.subgraphDataParser = new SubgraphDataChunkParser();
    this.voiceCalibrationParser = new VoiceCalibrationChunkParser(logger);
    this.audioCalibrationParser = new AudioCalibrationChunkParser(logger);
    this.tagDataParser = new TagDataChunkParser(logger);
    this.taggedModuleMapParser = new TaggedModuleMapChunkParser(logger);
    this.driverCalibrationParser = new DriverCalibrationChunkParser(logger);
    this.bootUpLoadingParser = new BootUpLoadingChunkParser();
    this.moduleManagerParser = new ModuleManagerChunkParser();
  }

  /**
   * Parse a single chunk based on its type
   * All raw data (including main chunk) is now provided in context.rawChunks
   */
  parseChunk(parserType: string, context: ChunkParseContext): BaseChunk {
    switch (parserType) {
      case PARSED_CHUNK_TYPES.HEADER:
        return this.parseHeaderChunk(context);
      case PARSED_CHUNK_TYPES.DATAPOOL:
        return this.parseDatapoolChunk(context);
      case PARSED_CHUNK_TYPES.USECASE_DATA:
        return this.parseUsecaseDataChunk(context);
      case PARSED_CHUNK_TYPES.SUBGRAPH_DATA:
        return this.parseSubgraphDataChunk(context);
      case PARSED_CHUNK_TYPES.SUBGRAPH_PAIR_DATA:
        return this.parseSubgraphPairDataChunk(context);
      case PARSED_CHUNK_TYPES.VOICE_CALIBRATION_DATA:
        return this.parseVoiceCalibrationChunk(context);
      case PARSED_CHUNK_TYPES.AUDIO_CALIBRATION_DATA:
        return this.parseAudioCalibrationChunk(context);
      case PARSED_CHUNK_TYPES.TAG_DATA:
        return this.parseTagDataChunk(context);
      case PARSED_CHUNK_TYPES.TAGGED_MODULE_MAP:
        return this.parseTaggedModuleMapChunk(context);
      case PARSED_CHUNK_TYPES.DRIVER_CALIBRATION_DATA:
        return this.parseDriverCalibrationChunk(context);
      case PARSED_CHUNK_TYPES.BOOTUP_LOADING:
        return this.parseBootUpLoadingChunk(context);
      case PARSED_CHUNK_TYPES.MODULE_MANAGER:
        return this.parseModuleManagerChunk(context);
      case PARSED_CHUNK_TYPES.GKV_ALIAS_DATA:
        return this.parseGkvAliasChunk(context);
      default:
        // Log warning for unknown parser types but don't crash
        if (this.logger) {
          this.logger.logWarn({
            msg: 'acdb_unknown_parser_type',
            description: `Unknown parser type encountered: ${parserType}. Skipping parsing.`,
            component: 'AcdbParser',
            tag: 'parsing',
          });
        }
        // Throw error as this should not happen if orchestrator is working correctly
        throw new Error(`Unknown parser type: ${parserType}`);
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
   * Parse SUBGRAPH_PAIR_DATA chunk using SubgraphPairDataChunkParser
   */
  private parseSubgraphPairDataChunk(
    context: ChunkParseContext,
  ): SubgraphPairDataChunk {
    return this.subgraphPairDataParser.parse(context);
  }

  /**
   * Parse VCPM_CALDATA chunk using VoiceCalibrationChunkParser
   */
  private parseVoiceCalibrationChunk(
    context: ChunkParseContext,
  ): VoiceCalibrationChunk {
    return this.voiceCalibrationParser.parse(context);
  }

  /**
   * Parse CALIBRATION_SUBGRAPH_LUT chunk using AudioCalibrationChunkParser
   */
  private parseAudioCalibrationChunk(
    context: ChunkParseContext,
  ): AudioCalibrationChunk {
    return this.audioCalibrationParser.parse(context);
  }

  /**
   * Parse MODULE_TAG_KEY_TABLE chunk using TagDataChunkParser
   */
  private parseTagDataChunk(context: ChunkParseContext): TagDataChunk {
    return this.tagDataParser.parse(context);
  }

  /**
   * Parse TAGGED_MODULES_LUT chunk using TaggedModuleMapChunkParser
   */
  private parseTaggedModuleMapChunk(
    context: ChunkParseContext,
  ): TaggedModuleMapChunk {
    return this.taggedModuleMapParser.parse(context);
  }

  /**
   * Parse DRIVER_CALIBRATION_LUT chunk using DriverCalibrationChunkParser
   */
  private parseDriverCalibrationChunk(
    context: ChunkParseContext,
  ): DriverCalibrationChunk {
    return this.driverCalibrationParser.parse(context);
  }

  /**
   * Parse BOOTUP_LOADING chunk using BootUpLoadingChunkParser
   */
  private parseBootUpLoadingChunk(
    context: ChunkParseContext,
  ): BootUpLoadingChunk {
    return this.bootUpLoadingParser.parse(context);
  }

  /**
   * Parse MODULE_MANAGER chunk using ModuleManagerChunkParser
   */
  private parseModuleManagerChunk(
    context: ChunkParseContext,
  ): ModuleManagerChunk {
    return this.moduleManagerParser.parse(context);
  }

  /**
   * Parse GALS chunk using GkvAliasChunkParser
   */
  private parseGkvAliasChunk(context: ChunkParseContext): GkvAliasChunk {
    return this.gkvAliasParser.parse(context);
  }
}
