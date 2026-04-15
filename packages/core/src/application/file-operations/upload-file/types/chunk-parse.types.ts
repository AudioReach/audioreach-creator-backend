/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {BaseChunk} from '../../shared/acdb-chunks/base-chunk.js';
import type {
  AcdbRawChunkType,
  ParsedChunkType,
} from '../../shared/constants/chunk-types.js';

/**
 * Specific input structure for chunk parsing tasks
 */
export interface ChunkParseInput {
  /** Type of the main chunk to parse */
  chunkType: string;
}

/**
 * Specific context structure for chunk parsing tasks
 */
export interface ChunkParseContextData {
  /** Raw chunk data for all chunks (main + dependencies) */
  rawChunks?: Map<AcdbRawChunkType, Uint8Array>;
  /** Parsed chunks available as dependencies */
  parsedChunks?: Map<ParsedChunkType, BaseChunk>;
}
