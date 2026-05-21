/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {HeaderChunk} from '../../../shared/acdb-chunks/header-chunk.js';
import type {ProjectHeaderMetadata} from '../../../../ports/persistence/repositories/bulk-read/bulk-read.repository.js';

/**
 * Input for building a HeaderChunk.
 */
export interface HeaderChunkBuildInput {
  headerMetadata: ProjectHeaderMetadata;
}

/**
 * Builder for HeaderChunk.
 * Converts ProjectHeaderMetadata from database into HeaderChunk object.
 *
 * This mirrors the entity builders from upload-file, but in reverse:
 * - Upload: Binary chunks → Domain entities
 * - Download: Domain entities → Chunk objects
 */
export const HeaderChunkBuilder = {
  /**
   * Build HeaderChunk from project header metadata.
   * Static method for consistency with upload pattern and worker compatibility.
   *
   * @param input - Input containing header metadata
   * @returns Populated HeaderChunk
   * @throws Error if metadata is invalid
   */
  buildChunk(input: HeaderChunkBuildInput): HeaderChunk {
    const {headerMetadata} = input;

    // Validate input
    if (!headerMetadata) {
      throw new Error('Header metadata is required');
    }

    if (!headerMetadata.version) {
      throw new Error('ACDB version information is required');
    }

    // Create and populate chunk
    const chunk = new HeaderChunk();
    chunk.headerVersion = 1; // Current header version
    chunk.version = headerMetadata.version;
    chunk.codecInfos = headerMetadata.codecInfos || [];
    chunk.modifiedDate = headerMetadata.modifiedDate;
    chunk.oemInfo = headerMetadata.oemInfo || '';

    return chunk;
  },
};
