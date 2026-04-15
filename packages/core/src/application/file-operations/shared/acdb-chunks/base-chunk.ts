/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ParsedChunkType} from '../constants/chunk-types.js';

/**
 * Abstract base class for all ACDB chunk types.
 * Chunks are pure data structures representing parsed sections of an ACDB file.
 *
 * Note: Chunk dependencies are now managed by ChunkMetadataRegistry
 * instead of being properties on chunk instances.
 */
export abstract class BaseChunk {
  /**
   * The parsed chunk type identifier.
   * This identifies what type of parsed chunk this is (e.g., 'HEAD', 'POOL', 'SUBGRAPH_DATA').
   */
  abstract readonly chunkType: ParsedChunkType;
}
