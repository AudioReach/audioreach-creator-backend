/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHUNK_TYPES} from '../../../shared/constants/chunk-types.js';
import {BaseChunkParser} from './base-chunk-parser.js';
import {HeaderChunk} from '../../../shared/acdb-chunks/header-chunk.js';
import type {ChunkParseContext} from '../../models/chunk-parse-context.js';
import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';

/**
 * Parser factory for HEADER chunks.
 */
export class HeaderChunkParser extends BaseChunkParser<HeaderChunk> {
  readonly chunkType = CHUNK_TYPES.HEADER;

  parse(context: ChunkParseContext): HeaderChunk {
    const data = this.validateAndGetChunkData(context);
    const chunk = new HeaderChunk();
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let pos = 0;

    try {
      // Read header version
      chunk.headerVersion = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      if (chunk.headerVersion !== 1) {
        throw new Error(`Unknown header version: ${chunk.headerVersion}`);
      }

      pos = this.parseVersionInfo(data, view, pos, chunk);
      pos = this.parseCodecInfo(data, view, pos, chunk);
      pos = this.parseModifiedDate(data, view, pos, chunk);
      this.parseOemInfo(data, view, pos, chunk);

      return chunk;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to parse HEADER chunk: ${error.message}`);
      }
      throw new Error('Failed to parse HEADER chunk: Unknown error');
    }
  }

  private validateAndGetChunkData(context: ChunkParseContext): Uint8Array {
    const data = context.rawChunks?.get(this.chunkType);
    if (!data) {
      throw new Error(`HEADER chunk not found in context`);
    }
    if (data.length < BinaryUtils.SIZEOF_UINT32) {
      throw new Error(
        'Invalid HEADER chunk: insufficient data for header version',
      );
    }
    return data;
  }

  private parseVersionInfo(
    data: Uint8Array,
    view: DataView,
    pos: number,
    chunk: HeaderChunk,
  ): number {
    // Ensure we have enough data for version info (4 bytes)
    if (data.length < pos + 4 * BinaryUtils.SIZEOF_UINT8) {
      throw new Error(
        'Invalid HEADER chunk: insufficient data for version info',
      );
    }

    // Read ACDB version info (4 bytes: major, minor, revision, cplInfo)
    const major = BinaryUtils.readUint8(view, pos);
    pos += BinaryUtils.SIZEOF_UINT8;
    const minor = BinaryUtils.readUint8(view, pos);
    pos += BinaryUtils.SIZEOF_UINT8;
    const revision = BinaryUtils.readUint8(view, pos);
    pos += BinaryUtils.SIZEOF_UINT8;
    const cplInfo = BinaryUtils.readUint8(view, pos);
    pos += BinaryUtils.SIZEOF_UINT8;

    chunk.version = {major, minor, revision, cplInfo};
    return pos;
  }

  private parseCodecInfo(
    data: Uint8Array,
    view: DataView,
    pos: number,
    chunk: HeaderChunk,
  ): number {
    // Read number of codecs
    if (data.length < pos + BinaryUtils.SIZEOF_UINT32) {
      throw new Error(
        'Invalid HEADER chunk: insufficient data for codec count',
      );
    }
    const numCodecs = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Read codec information
    chunk.codecInfos = [];
    for (let i = 0; i < numCodecs; i++) {
      const codecDataSize = 3 * BinaryUtils.SIZEOF_UINT32;
      if (data.length < pos + codecDataSize) {
        throw new Error(
          `Invalid HEADER chunk: insufficient data for codec ${i}`,
        );
      }

      const codecId = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;
      const codecMajor = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;
      const codecMinor = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      chunk.codecInfos.push({
        codecId,
        majorVersion: codecMajor,
        minorVersion: codecMinor,
      });
    }

    return pos;
  }

  private parseModifiedDate(
    data: Uint8Array,
    view: DataView,
    pos: number,
    chunk: HeaderChunk,
  ): number {
    if (data.length < pos + BinaryUtils.SIZEOF_UINT32) {
      throw new Error(
        'Invalid HEADER chunk: insufficient data for modified date',
      );
    }
    chunk.modifiedDate = BinaryUtils.readUint32(view, pos);
    return pos + BinaryUtils.SIZEOF_UINT32;
  }

  private parseOemInfo(
    data: Uint8Array,
    view: DataView,
    pos: number,
    chunk: HeaderChunk,
  ): void {
    if (data.length < pos + BinaryUtils.SIZEOF_UINT32) {
      throw new Error(
        'Invalid HEADER chunk: insufficient data for OEM info size',
      );
    }
    const oemInfoSize = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    if (data.length < pos + oemInfoSize) {
      throw new Error('Invalid HEADER chunk: insufficient data for OEM info');
    }
    const oemInfoBytes = data.slice(pos, pos + oemInfoSize);
    chunk.oemInfo = new TextDecoder('ascii').decode(oemInfoBytes);
  }
}
