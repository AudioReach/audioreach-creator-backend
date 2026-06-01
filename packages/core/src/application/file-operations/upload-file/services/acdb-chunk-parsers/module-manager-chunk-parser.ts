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

export interface ModuleManagerCapi {
  moduleType: number;
  moduleId: number;
  fileNameLen: number;
  tagLen: number;
  errorCode: number;
  fileName: string;
  tag: string;
}

export interface ModuleManagerRegistration {
  interfaceType: number;
  interfaceVersion: number;
  capi: ModuleManagerCapi;
}

export interface ModuleManagerChunk {
  chunkType: 'MODULE_MANAGER';
  registrations: Map<number, Map<number, ModuleManagerRegistration>>;
}

export class ModuleManagerChunkParser extends BaseChunkParser<ModuleManagerChunk> {
  readonly chunkType = PARSED_CHUNK_TYPES.MODULE_MANAGER;

  parse(context: ChunkParseContext): ModuleManagerChunk {
    if (!context.rawChunks) {
      throw new Error('rawChunks not found in context');
    }

    const data = context.rawChunks.get(ACDB_RAW_CHUNK_TYPES.MODULE_MANAGER);
    if (!data) {
      throw new Error('MODULE_MANAGER raw chunk not found in context');
    }

    const offset = 0;
    const length = data.length;
    const registrations = new Map<
      number,
      Map<number, ModuleManagerRegistration>
    >();

    if (length === 0) {
      return {chunkType: 'MODULE_MANAGER', registrations};
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let pos = offset;

    // NumProcIDs
    const numProcIds = view.getUint32(pos, true);
    pos += BinaryUtils.SIZEOF_UINT32;

    // ProcIDModRegDataEntry+
    for (let i = 0; i < numProcIds; i++) {
      // ProcIDModRegDataSize (skip)
      pos += BinaryUtils.SIZEOF_UINT32;

      // ProcID
      const procId = view.getUint32(pos, true);
      pos += BinaryUtils.SIZEOF_UINT32;

      // NumMIDs
      const numMIds = view.getUint32(pos, true);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Structure Version (skip)
      pos += BinaryUtils.SIZEOF_UINT32;

      const moduleRegistrations = new Map<number, ModuleManagerRegistration>();

      // ModRegDataEntry+
      for (let j = 0; j < numMIds; j++) {
        // ModeRegDataSize
        const modeRegDataSize = view.getUint32(pos, true);
        pos += BinaryUtils.SIZEOF_UINT32;

        const regDataPosStart = pos;

        // Interface Type (2 bytes: 1 byte value + 1 byte padding)
        const interfaceType = view.getUint16(pos, true);
        pos += BinaryUtils.SIZEOF_UINT16;

        // Interface Version (2 bytes: 1 byte value + 1 byte padding)
        const interfaceVersion = view.getUint16(pos, true);
        pos += BinaryUtils.SIZEOF_UINT16;

        // Module Type (4 bytes: 2 bytes value + 2 bytes padding)
        const moduleType = view.getUint16(pos, true);
        pos += BinaryUtils.SIZEOF_UINT32;

        // Module ID (4 bytes)
        const moduleId = view.getUint32(pos, true);
        pos += BinaryUtils.SIZEOF_UINT32;

        // File Name Length (2 bytes: 1 byte value + 1 byte padding)
        const fileNameLen = view.getUint8(pos);
        pos += BinaryUtils.SIZEOF_UINT16;

        // Tag Length (2 bytes)
        const tagLen = view.getUint16(pos, true);
        pos += BinaryUtils.SIZEOF_UINT16;

        // Error Code
        const errorCode = view.getUint32(pos, true);
        pos += BinaryUtils.SIZEOF_UINT32;

        // File Name
        const decoder = new TextDecoder('utf8');
        const fileName = decoder.decode(data.subarray(pos, pos + fileNameLen));
        pos += fileNameLen;

        // Tag
        const tag = decoder.decode(data.subarray(pos, pos + tagLen));

        // Skip alignment/padding bytes to next entry
        pos = regDataPosStart + modeRegDataSize;

        const registration: ModuleManagerRegistration = {
          interfaceType,
          interfaceVersion,
          capi: {
            moduleType,
            moduleId,
            fileNameLen,
            tagLen,
            errorCode,
            fileName,
            tag,
          },
        };

        moduleRegistrations.set(moduleId, registration);
      }

      registrations.set(procId, moduleRegistrations);
    }

    return {chunkType: 'MODULE_MANAGER', registrations};
  }
}
