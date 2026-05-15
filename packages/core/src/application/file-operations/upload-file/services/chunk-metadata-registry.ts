/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  ACDB_RAW_CHUNK_TYPES,
  PARSED_CHUNK_TYPES,
  type AcdbRawChunkType,
  type ParsedChunkType,
} from '../../shared/constants/chunk-types.js';

/**
 * Metadata for ACDB parsers.
 * Defines dependencies and descriptions for each parser type.
 */
export interface ParserMetadata {
  /** Parsed chunk type identifier */
  parserType: ParsedChunkType;
  /** Raw chunk dependencies (need binary data from file) */
  rawDependencies: AcdbRawChunkType[];
  /** Parsed chunk dependencies (need already-parsed chunks) */
  parsedDependencies: ParsedChunkType[];
  /** Human-readable description of the parser */
  description: string;
}

/**
 * Static registry of parser metadata.
 * Provides centralized metadata for all ACDB parsers without needing
 * to instantiate chunk objects.
 *
 * Benefits:
 * - No dummy chunk creation needed
 * - Centralized metadata management
 * - Easy to extend with new parser types
 * - Type-safe at compile time
 */
export class ChunkMetadataRegistry {
  private static metadata: ParserMetadata[] = [
    {
      parserType: PARSED_CHUNK_TYPES.HEADER,
      rawDependencies: [ACDB_RAW_CHUNK_TYPES.HEADER],
      parsedDependencies: [],
      description: 'File header with version and metadata',
    },
    {
      parserType: PARSED_CHUNK_TYPES.DATAPOOL,
      rawDependencies: [ACDB_RAW_CHUNK_TYPES.DATAPOOL],
      parsedDependencies: [],
      description: 'Datapool chunk',
    },
    {
      parserType: PARSED_CHUNK_TYPES.USECASE_DATA,
      rawDependencies: [
        ACDB_RAW_CHUNK_TYPES.GKV_TABLE,
        ACDB_RAW_CHUNK_TYPES.GKV_LUT,
      ],
      parsedDependencies: [PARSED_CHUNK_TYPES.DATAPOOL],
      description: 'Usecase data with GKV table and lookup functionality',
    },
    {
      parserType: PARSED_CHUNK_TYPES.SUBGRAPH_DATA,
      rawDependencies: [],
      parsedDependencies: [
        PARSED_CHUNK_TYPES.USECASE_DATA,
        PARSED_CHUNK_TYPES.DATAPOOL,
      ],
      description:
        'Derived subgraph data extracted from usecase entries and datapool',
    },
    {
      parserType: PARSED_CHUNK_TYPES.SUBGRAPH_PAIR_DATA,
      rawDependencies: [
        ACDB_RAW_CHUNK_TYPES.SUBGRAPH_CONNECTION_LUT,
        ACDB_RAW_CHUNK_TYPES.SUBGRAPH_CONNECTION_DEF,
        ACDB_RAW_CHUNK_TYPES.SUBGRAPH_CONNECTION_DOT,
      ],
      parsedDependencies: [PARSED_CHUNK_TYPES.DATAPOOL],
      description:
        'Subgraph connection pairs with data and control links between subgraphs',
    },
    // Voice calibration chunks
    {
      parserType: PARSED_CHUNK_TYPES.VOICE_CALIBRATION_DATA,
      rawDependencies: [
        ACDB_RAW_CHUNK_TYPES.VCPM_CALDATA,
        ACDB_RAW_CHUNK_TYPES.VCPM_MASTER_KEY,
        ACDB_RAW_CHUNK_TYPES.VCPM_CALIBRATION_KEY_TABLE,
        ACDB_RAW_CHUNK_TYPES.VCPM_CALIBRATION_DATA_LUT,
        ACDB_RAW_CHUNK_TYPES.VCPM_CALIBRATION_DATA_DEF,
      ],
      // NOTE: DATAPOOL is listed as a parsed dependency to enforce ordering in the orchestrator,
      // even though the parser itself only uses rawChunks. The parsed DATAPOOL chunk is actually
      // consumed later by CalibrationDataBuilder.extractModuleParameterPayloadsVoice().
      // This dependency ensures DATAPOOL is parsed before voice calibration parsing begins.
      parsedDependencies: [PARSED_CHUNK_TYPES.DATAPOOL],
      description:
        'Voice calibration data with module-parameter-payload information',
    },
    {
      parserType: PARSED_CHUNK_TYPES.AUDIO_CALIBRATION_DATA,
      rawDependencies: [
        ACDB_RAW_CHUNK_TYPES.CALIBRATION_SUBGRAPH_LUT,
        ACDB_RAW_CHUNK_TYPES.CALIBRATION_KEY_TABLE,
        ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_LUT,
        ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_DEF,
        ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_DOT,
      ],
      // NOTE: DATAPOOL is listed as a parsed dependency to enforce ordering in the orchestrator,
      // even though the parser itself only uses rawChunks. The parsed DATAPOOL chunk is actually
      // consumed later by CalibrationDataBuilder.extractModuleParameterPayloads().
      // This dependency ensures DATAPOOL is parsed before audio calibration parsing begins.
      parsedDependencies: [PARSED_CHUNK_TYPES.DATAPOOL],
      description: 'Audio calibration data from CALIBRATION_SUBGRAPH_LUT chunk',
    },
    {
      parserType: PARSED_CHUNK_TYPES.TAG_DATA,
      rawDependencies: [
        ACDB_RAW_CHUNK_TYPES.MODULE_TAG_KEY_TABLE,
        ACDB_RAW_CHUNK_TYPES.MODULE_TAG_DATA_LUT,
        ACDB_RAW_CHUNK_TYPES.MODULE_TAG_DATA_DEF,
        ACDB_RAW_CHUNK_TYPES.MODULE_TAG_DATA_DOT,
      ],
      // NOTE: DATAPOOL is listed as a parsed dependency to enforce ordering in the orchestrator,
      // even though the parser itself only uses rawChunks. The parsed DATAPOOL chunk is actually
      // consumed later by TagDataBuilder when resolving data offsets.
      // This dependency ensures DATAPOOL is parsed before tag data parsing begins.
      parsedDependencies: [PARSED_CHUNK_TYPES.DATAPOOL],
      description: 'Module tag data with key-value pairs',
    },
    {
      parserType: PARSED_CHUNK_TYPES.TAGGED_MODULE_MAP,
      rawDependencies: [
        ACDB_RAW_CHUNK_TYPES.TAGGED_MODULES_LUT,
        ACDB_RAW_CHUNK_TYPES.TAGGED_MODULES_DEF,
      ],
      parsedDependencies: [],
      description: 'Tagged module map - associates tags with modules',
    },
  ];

  /**
   * Get metadata for a specific parser type
   * @param parserType - The parser type identifier
   * @returns Parser metadata if found, undefined otherwise
   */
  static getMetadata(parserType: string): ParserMetadata | undefined {
    return this.metadata.find(meta => meta.parserType === parserType);
  }

  /**
   * Get all dependencies for a specific parser type
   * @param parserType - The parser type identifier
   * @returns Array of all dependency chunk types (both raw and parsed)
   */
  static getDependencies(
    parserType: string,
  ): Array<AcdbRawChunkType | ParsedChunkType> {
    const meta = this.metadata.find(meta => meta.parserType === parserType);
    return meta ? [...meta.rawDependencies, ...meta.parsedDependencies] : [];
  }

  /**
   * Get raw dependencies for a specific parser type
   * @param parserType - The parser type identifier
   * @returns Array of raw chunk types that need raw binary data from file
   */
  static getRawDependencies(parserType: string): AcdbRawChunkType[] {
    const meta = this.metadata.find(meta => meta.parserType === parserType);
    return meta?.rawDependencies || [];
  }

  /**
   * Get parsed dependencies for a specific parser type
   * @param parserType - The parser type identifier
   * @returns Array of parsed chunk types that need already-parsed chunk objects
   */
  static getParsedDependencies(parserType: string): ParsedChunkType[] {
    const meta = this.metadata.find(meta => meta.parserType === parserType);
    return meta?.parsedDependencies || [];
  }

  /**
   * Get all registered parser types
   * @returns Array of all parser type identifiers
   */
  static getAllParserTypes(): ParsedChunkType[] {
    return this.metadata.map(meta => meta.parserType);
  }

  /**
   * Register a new parser type (for extensibility)
   * @param metadata - Metadata for the new parser type
   */
  static registerParserType(metadata: ParserMetadata): void {
    const existingIndex = this.metadata.findIndex(
      meta => meta.parserType === metadata.parserType,
    );
    if (existingIndex === -1) {
      this.metadata.push(metadata);
    } else {
      this.metadata[existingIndex] = metadata;
    }
  }

  /**
   * Check if a parser type is registered
   * @param parserType - The parser type identifier
   * @returns true if parser type is registered, false otherwise
   */
  static hasParserType(parserType: string): boolean {
    return this.metadata.some(meta => meta.parserType === parserType);
  }

  /**
   * Check if a chunk type is known (either as a parser or dependency)
   * @param chunkType - The chunk type identifier
   * @returns true if chunk type is registered as parser or referenced as a dependency
   */
  static isKnownChunkType(chunkType: string): boolean {
    // Check if it's a main registered parser
    if (this.hasParserType(chunkType)) {
      return true;
    }

    // Check if it's referenced as a dependency
    return this.metadata.some(
      meta =>
        meta.rawDependencies.includes(chunkType as AcdbRawChunkType) ||
        meta.parsedDependencies.includes(chunkType as ParsedChunkType),
    );
  }

  /**
   * Get description for a parser type
   * @param parserType - The parser type identifier
   * @returns Description if found, undefined otherwise
   */
  static getDescription(parserType: string): string | undefined {
    return this.metadata.find(meta => meta.parserType === parserType)
      ?.description;
  }
}
