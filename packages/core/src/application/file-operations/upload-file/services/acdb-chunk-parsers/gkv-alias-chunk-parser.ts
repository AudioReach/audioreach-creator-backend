/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  ACDB_RAW_CHUNK_TYPES,
  PARSED_CHUNK_TYPES,
} from '../../../shared/constants/chunk-types.js';
import {BaseChunkParser} from './base-chunk-parser.js';
import {
  GkvAliasChunk,
  type GkvAliasEntry,
} from '../../../shared/acdb-chunks/gkv-alias-chunk.js';
import type {ChunkParseContext} from '../../models/chunk-parse-context.js';
import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';
import {
  KeyValue,
  KeyValuePairList,
} from '../../../../../shared/types/key-value-pair.js';
import type {DatapoolChunk} from '../../../shared/acdb-chunks/datapool-chunk.js';

const TEXT_DECODER = new TextDecoder('ascii');
const ALIAS_SEPARATOR = ' | ';

/**
 * Parser for the GKV alias chunk (GALS).
 * Maps each key-vector (KeyValuePairList) to a GkvAliasEntry containing
 * a usecaseId and optional usecaseName.
 *
 * The chunk is optional — returns an empty GkvAliasChunk when absent.
 *
 * Chunk format:
 *   GkvAliasChunk = NumKeyTables GkvAliasTable+
 *   GkvAliasTable = NumKeys NumGkvs GkvTable+
 *   GkvTable = (numKeys × [keyId uint32, keyVal uint32]) datapoolOffset uint32
 *
 * Datapool payload at datapoolOffset (outer size header already stripped by DatapoolChunk):
 *   [uint32 innerStringLen][ASCII string bytes]
 *   ASCII string format: "usecaseId" or "usecaseId | usecaseName\0"
 */
export class GkvAliasChunkParser extends BaseChunkParser<GkvAliasChunk> {
  readonly chunkType = PARSED_CHUNK_TYPES.GKV_ALIAS_DATA;

  parse(context: ChunkParseContext): GkvAliasChunk {
    const chunk = new GkvAliasChunk();

    const rawData = context.rawChunks?.get(ACDB_RAW_CHUNK_TYPES.GKV_ALIAS);
    if (!rawData) {
      return chunk;
    }

    const datapoolChunk = context.parsedChunks?.get(
      PARSED_CHUNK_TYPES.DATAPOOL,
    ) as DatapoolChunk | undefined;

    if (!datapoolChunk) {
      throw new Error(
        'DATAPOOL chunk not found in context for GKV alias parsing',
      );
    }

    const view = new DataView(
      rawData.buffer,
      rawData.byteOffset,
      rawData.byteLength,
    );
    let pos = 0;

    try {
      const numKeyTables = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      for (let t = 0; t < numKeyTables; t++) {
        const numKeys = BinaryUtils.readUint32(view, pos);
        pos += BinaryUtils.SIZEOF_UINT32;

        const numGkvs = BinaryUtils.readUint32(view, pos);
        pos += BinaryUtils.SIZEOF_UINT32;

        for (let g = 0; g < numGkvs; g++) {
          const keyValues: KeyValue[] = [];
          for (let k = 0; k < numKeys; k++) {
            const keyId = BinaryUtils.readUint32(view, pos);
            pos += BinaryUtils.SIZEOF_UINT32;
            const keyVal = BinaryUtils.readUint32(view, pos);
            pos += BinaryUtils.SIZEOF_UINT32;
            keyValues.push(new KeyValue(keyId, keyVal));
          }

          const datapoolOffset = BinaryUtils.readUint32(view, pos);
          pos += BinaryUtils.SIZEOF_UINT32;

          const aliasEntry = this.resolveAlias(datapoolChunk, datapoolOffset);
          if (aliasEntry !== undefined) {
            chunk.setAlias(new KeyValuePairList(keyValues), aliasEntry);
          }
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to parse GALS chunk: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    return chunk;
  }

  private resolveAlias(
    datapoolChunk: DatapoolChunk,
    datapoolOffset: number,
  ): GkvAliasEntry | undefined {
    const payload = datapoolChunk.getDataAtOffset(datapoolOffset);
    if (!payload || payload.length < BinaryUtils.SIZEOF_UINT32) {
      return undefined;
    }

    // Skip inner string-length uint32, decode remainder as ASCII
    const raw = TEXT_DECODER.decode(
      payload.subarray(BinaryUtils.SIZEOF_UINT32),
    );
    const alias = raw.split('\0')[0];

    const sepIdx = alias.indexOf(ALIAS_SEPARATOR);
    const rawId = sepIdx === -1 ? alias : alias.slice(0, sepIdx);
    const usecaseId = Number.parseInt(rawId, 10);
    if (Number.isNaN(usecaseId)) {
      return undefined;
    }

    if (sepIdx === -1) {
      return {usecaseId};
    }

    return {
      usecaseId,
      usecaseName: alias.slice(sepIdx + ALIAS_SEPARATOR.length),
    };
  }
}
