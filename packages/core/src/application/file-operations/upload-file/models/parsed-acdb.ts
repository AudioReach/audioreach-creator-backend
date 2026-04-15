/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {BaseChunk} from '../../shared/acdb-chunks/base-chunk.js';
import type {ParsedChunkType} from '../../shared/constants/chunk-types.js';

/**
 * Container for all parsed chunks from an ACDB file
 */
export class ParsedAcdb {
  private chunks = new Map<ParsedChunkType, BaseChunk>();

  public fileType: number = 0;

  /**
   * Add a parsed chunk to the collection
   */
  addChunk(chunkType: ParsedChunkType, chunk: BaseChunk): void {
    this.chunks.set(chunkType, chunk);
  }

  /**
   * Retrieve a specific chunk by type
   */
  getChunk<T extends BaseChunk>(chunkType: ParsedChunkType): T | undefined {
    return this.chunks.get(chunkType) as T | undefined;
  }

  /**
   * Check if a chunk type exists in the parsed data
   */
  hasChunk(chunkType: ParsedChunkType): boolean {
    return this.chunks.has(chunkType);
  }

  /**
   * Get all parsed chunks
   */
  getAllChunks(): Map<ParsedChunkType, BaseChunk> {
    return new Map(this.chunks);
  }
}
