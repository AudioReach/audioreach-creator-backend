/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ChunkMetadata} from './chunk-metadata.js';

/**
 * Information extracted from ACDB file header and structure.
 * Contains file-level metadata and chunk descriptors.
 */
export class AcdbFileInfo {
  /**
   * File ID - should match "ACDB" when converted to string.
   */
  public fileId: number;

  /**
   * File type identifier.
   */
  public fileType: number;

  /**
   * Total file length as specified in header.
   */
  public fileLength: number;

  /**
   * Array of chunk descriptors found in the file.
   * Each descriptor contains chunk type, offset, and length.
   */
  public chunks: ChunkMetadata[];

  constructor(
    fileId: number = 0,
    fileType: number = 0,
    fileLength: number = 0,
    chunks: ChunkMetadata[] = [],
  ) {
    this.fileId = fileId;
    this.fileType = fileType;
    this.fileLength = fileLength;
    this.chunks = chunks;
  }

  /**
   * Get file ID as ASCII string (should be "ACDB" for valid files).
   */
  getFileIdAsString(): string {
    const bytes = new Uint8Array(4);
    bytes[0] = this.fileId & 0xff;
    bytes[1] = (this.fileId >>> 8) & 0xff;
    bytes[2] = (this.fileId >>> 16) & 0xff;
    bytes[3] = (this.fileId >>> 24) & 0xff;
    return new TextDecoder('ascii').decode(bytes);
  }

  /**
   * Validate that this is a valid ACDB file.
   */
  isValidAcdbFile(): boolean {
    return this.getFileIdAsString() === 'ACDB';
  }
}
