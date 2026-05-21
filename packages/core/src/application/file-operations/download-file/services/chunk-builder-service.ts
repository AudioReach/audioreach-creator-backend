/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {HeaderChunkBuilder} from './chunk-builders/header-chunk-builder.js';
import type {HeaderChunk} from '../../shared/acdb-chunks/header-chunk.js';
import type {ProjectHeaderMetadata} from '../../../ports/persistence/repositories/bulk-read/bulk-read.repository.js';

/**
 * Service for building ACDB chunk objects from domain entities.
 * Orchestrates the chunk building process.
 *
 * This mirrors the EntityBuilderService from upload-file, but in reverse:
 * - Upload: Binary → Chunks → Entities
 * - Download: Entities → Chunks → Binary
 */
export class ChunkBuilderService {
  /**
   * Build HeaderChunk from project header metadata.
   *
   * @param headerMetadata - Header metadata from database
   * @returns Populated HeaderChunk ready for serialization
   */
  buildHeaderChunk(headerMetadata: ProjectHeaderMetadata): HeaderChunk {
    return HeaderChunkBuilder.buildChunk({headerMetadata});
  }
}
