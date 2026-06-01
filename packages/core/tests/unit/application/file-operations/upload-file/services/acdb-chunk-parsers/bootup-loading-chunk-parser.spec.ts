/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeEach} from '@jest/globals';
import {BootUpLoadingChunkParser} from '../../../../../../../src/application/file-operations/upload-file/services/acdb-chunk-parsers/bootup-loading-chunk-parser.js';
import {ACDB_RAW_CHUNK_TYPES} from '../../../../../../../src/application/file-operations/shared/constants/chunk-types.js';
import type {ChunkParseContext} from '../../../../../../../src/application/file-operations/upload-file/models/chunk-parse-context.js';

describe('BootUpLoadingChunkParser', () => {
  let parser: BootUpLoadingChunkParser;

  beforeEach(() => {
    parser = new BootUpLoadingChunkParser();
  });

  it('should parse empty chunk', () => {
    const data = new Uint8Array(0);
    const context: ChunkParseContext = {
      rawChunks: new Map([[ACDB_RAW_CHUNK_TYPES.BOOTUP_LOADING, data]]),
    };
    const result = parser.parse(context);

    expect(result.chunkType).toBe('BOOTUP_LOADING');
    expect(result.bootUpModules.size).toBe(0);
  });

  it('should parse chunk with single processor and single module', () => {
    // NumProcIDs (1) + ProcID (100) + NumMIDs (1) + ModuleID (200)
    // Create buffer with proper uint32 values
    const buffer = new ArrayBuffer(16);
    const view = new DataView(buffer);
    view.setUint32(0, 1, true); // NumProcIDs = 1
    view.setUint32(4, 100, true); // ProcID = 100
    view.setUint32(8, 1, true); // NumMIDs = 1
    view.setUint32(12, 200, true); // ModuleID = 200
    const data = new Uint8Array(buffer);

    const context: ChunkParseContext = {
      rawChunks: new Map([[ACDB_RAW_CHUNK_TYPES.BOOTUP_LOADING, data]]),
    };
    const result = parser.parse(context);

    expect(result.chunkType).toBe('BOOTUP_LOADING');
    expect(result.bootUpModules.size).toBe(1);
    expect(result.bootUpModules.has(100)).toBe(true);

    const modules = result.bootUpModules.get(100);
    expect(modules?.size).toBe(1);
    expect(modules?.has(200)).toBe(true);
  });

  it('should parse chunk with multiple processors and modules', () => {
    // NumProcIDs (2)
    // Proc 1: ProcID (100) + NumMIDs (2) + ModuleIDs (200, 201)
    // Proc 2: ProcID (101) + NumMIDs (1) + ModuleID (300)
    // Create buffer with proper uint32 values
    const buffer = new ArrayBuffer(32);
    const view = new DataView(buffer);
    view.setUint32(0, 2, true); // NumProcIDs = 2
    view.setUint32(4, 100, true); // ProcID = 100
    view.setUint32(8, 2, true); // NumMIDs = 2
    view.setUint32(12, 200, true); // ModuleID = 200
    view.setUint32(16, 201, true); // ModuleID = 201
    view.setUint32(20, 101, true); // ProcID = 101
    view.setUint32(24, 1, true); // NumMIDs = 1
    view.setUint32(28, 300, true); // ModuleID = 300
    const data = new Uint8Array(buffer);

    const context: ChunkParseContext = {
      rawChunks: new Map([[ACDB_RAW_CHUNK_TYPES.BOOTUP_LOADING, data]]),
    };
    const result = parser.parse(context);

    expect(result.chunkType).toBe('BOOTUP_LOADING');
    expect(result.bootUpModules.size).toBe(2);

    // Check Proc 100
    expect(result.bootUpModules.has(100)).toBe(true);
    const modules100 = result.bootUpModules.get(100);
    expect(modules100?.size).toBe(2);
    expect(modules100?.has(200)).toBe(true);
    expect(modules100?.has(201)).toBe(true);

    // Check Proc 101
    expect(result.bootUpModules.has(101)).toBe(true);
    const modules101 = result.bootUpModules.get(101);
    expect(modules101?.size).toBe(1);
    expect(modules101?.has(300)).toBe(true);
  });
});
