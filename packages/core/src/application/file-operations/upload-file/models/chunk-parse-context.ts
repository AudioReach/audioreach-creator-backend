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
 * Context provided to chunks during parsing
 */
export interface ChunkParseContext {
  /**
   * Raw binary chunk data from ACDB file.
   * Used for dependencies that need access to the original binary data.
   */
  rawChunks?: Map<AcdbRawChunkType, Uint8Array>;

  /**
   * Already-parsed chunks (both file chunks and derived chunks).
   * Used for chunk dependencies that need access to parsed chunk objects.
   */
  parsedChunks?: Map<ParsedChunkType, BaseChunk>;
}
