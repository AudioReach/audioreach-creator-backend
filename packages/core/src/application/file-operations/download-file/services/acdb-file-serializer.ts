/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DownloadEntities} from '../../../ports/persistence/repositories/bulk-read/bulk-read.repository.js';
import {ChunkBuilderService} from './chunk-builder-service.js';
import {HeaderChunkSerializer} from './chunk-serializers/header-chunk-serializer.js';
import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';
import {ACDB_RAW_CHUNK_TYPES} from '../../shared/constants/chunk-types.js';

/**
 * Serializes domain entities to binary ACDB format.
 *
 * This is the reverse operation of AcdbFileOrchestrator (upload).
 * Converts database entities back into .acdb file format.
 *
 * Architecture:
 * - Phase 1: Build chunk objects from entities (ChunkBuilderService)
 * - Phase 2: Serialize chunks to binary (ChunkSerializers)
 * - Phase 3: Assemble final ACDB file with headers
 */
export class AcdbFileSerializer {
  private readonly chunkBuilder: ChunkBuilderService;
  private readonly headerSerializer: HeaderChunkSerializer;

  constructor() {
    this.chunkBuilder = new ChunkBuilderService();
    this.headerSerializer = new HeaderChunkSerializer();
  }

  /**
   * Serialize entities to complete ACDB file.
   *
   * @param entities - Domain entities from database
   * @returns Binary ACDB file as Uint8Array
   * @throws Error if serialization fails
   */
  serialize(entities: DownloadEntities): Uint8Array {
    try {
      // Phase 1: Build chunk objects from entities
      const headerChunk = this.chunkBuilder.buildHeaderChunk(
        entities.headerMetadata,
      );

      // Phase 2: Serialize chunks to binary
      const headerData = this.headerSerializer.serialize(headerChunk);

      // Phase 3: Assemble final ACDB file
      return this.assembleAcdbFile(headerData);
    } catch (error) {
      throw new Error(
        `Failed to serialize ACDB file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Assemble complete ACDB file with file header and chunk wrappers.
   *
   * ACDB file structure:
   * [File Header: 12 bytes]
   *   - File ID: "ACDB" (4 bytes)
   *   - File Type: uint32 (4 bytes) - placeholder 0 for now
   *   - File Length: uint32 (4 bytes) - size of chunks ONLY (excludes this 12-byte header)
   * [HEADER Chunk]
   *   - Chunk ID: "HEAD" (4 bytes)
   *   - Chunk Length: uint32 (4 bytes)
   *   - Chunk Data: [N bytes]
   *
   * @param headerData - Serialized header chunk data
   * @returns Complete ACDB file as Uint8Array
   */
  private assembleAcdbFile(headerData: Uint8Array): Uint8Array {
    const FILE_HEADER_SIZE = 12;
    const CHUNK_HEADER_SIZE = 8; // chunk ID (4) + chunk length (4)

    const totalSize = FILE_HEADER_SIZE + CHUNK_HEADER_SIZE + headerData.length;
    const buffer = new Uint8Array(totalSize);
    const view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    );
    let pos = 0;

    // Write file header (12 bytes)
    const fileId = BinaryUtils.stringToUint32('ACDB');
    BinaryUtils.writeUint32(view, pos, fileId);
    pos += BinaryUtils.SIZEOF_UINT32;

    // TODO: File type - placeholder 0 for now, will be filled later
    const fileType = 0;
    BinaryUtils.writeUint32(view, pos, fileType);
    pos += BinaryUtils.SIZEOF_UINT32;

    // File Length = size of chunks only (excludes 12-byte file header)
    const fileLength = CHUNK_HEADER_SIZE + headerData.length;
    BinaryUtils.writeUint32(view, pos, fileLength);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Write HEADER chunk wrapper (8 bytes)
    const chunkId = BinaryUtils.stringToUint32(ACDB_RAW_CHUNK_TYPES.HEADER);
    BinaryUtils.writeUint32(view, pos, chunkId);
    pos += BinaryUtils.SIZEOF_UINT32;

    BinaryUtils.writeUint32(view, pos, headerData.length);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Write HEADER chunk data
    buffer.set(headerData, pos);

    return buffer;
  }
}
