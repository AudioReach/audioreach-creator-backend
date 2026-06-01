/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';
import {BaseChunkParser} from './base-chunk-parser.js';
import type {ChunkParseContext} from '../../models/chunk-parse-context.js';
import {
  PARSED_CHUNK_TYPES,
  ACDB_RAW_CHUNK_TYPES,
} from '../../../shared/constants/chunk-types.js';

export interface BootUpLoadingChunk {
  chunkType: 'BOOTUP_LOADING';
  bootUpModules: Map<number, Set<number>>;
}

export class BootUpLoadingChunkParser extends BaseChunkParser<BootUpLoadingChunk> {
  readonly chunkType = PARSED_CHUNK_TYPES.BOOTUP_LOADING;

  parse(context: ChunkParseContext): BootUpLoadingChunk {
    if (!context.rawChunks) {
      throw new Error('rawChunks not found in context');
    }

    const data = context.rawChunks.get(ACDB_RAW_CHUNK_TYPES.BOOTUP_LOADING);
    if (!data) {
      throw new Error('BOOTUP_LOADING raw chunk not found in context');
    }

    const offset = 0;
    const length = data.length;
    const bootUpModules = new Map<number, Set<number>>();

    if (length === 0) {
      return {chunkType: 'BOOTUP_LOADING', bootUpModules};
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let pos = offset;

    // NumProcIDs
    const numProcIds = view.getUint32(pos, true);
    pos += BinaryUtils.SIZEOF_UINT32;

    // ProcIDBootUpLoadingModEntry+
    for (let i = 0; i < numProcIds; i++) {
      // ProcID
      const procId = view.getUint32(pos, true);
      pos += BinaryUtils.SIZEOF_UINT32;

      // NumMIDs
      const numMIds = view.getUint32(pos, true);
      pos += BinaryUtils.SIZEOF_UINT32;

      const moduleIds = new Set<number>();

      // ModuleID+
      for (let j = 0; j < numMIds; j++) {
        const moduleId = view.getUint32(pos, true);
        pos += BinaryUtils.SIZEOF_UINT32;
        moduleIds.add(moduleId);
      }

      bootUpModules.set(procId, moduleIds);
    }

    return {chunkType: 'BOOTUP_LOADING', bootUpModules};
  }
}
