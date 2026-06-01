/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeEach} from '@jest/globals';
import {ModuleManagerChunkParser} from '../../../../../../../src/application/file-operations/upload-file/services/acdb-chunk-parsers/module-manager-chunk-parser.js';
import {ACDB_RAW_CHUNK_TYPES} from '../../../../../../../src/application/file-operations/shared/constants/chunk-types.js';
import type {ChunkParseContext} from '../../../../../../../src/application/file-operations/upload-file/models/chunk-parse-context.js';

describe('ModuleManagerChunkParser', () => {
  let parser: ModuleManagerChunkParser;

  beforeEach(() => {
    parser = new ModuleManagerChunkParser();
  });

  it('should parse empty chunk', () => {
    const data = new Uint8Array(0);
    const context: ChunkParseContext = {
      rawChunks: new Map([[ACDB_RAW_CHUNK_TYPES.MODULE_MANAGER, data]]),
    };
    const result = parser.parse(context);

    expect(result.chunkType).toBe('MODULE_MANAGER');
    expect(result.registrations.size).toBe(0);
  });

  it('should parse chunk with single processor and single module registration', () => {
    const fileName = 'test.so';
    const tag = 'v1.0';

    // Calculate sizes
    const modeRegDataSize =
      4 + 4 + 4 + 2 + 2 + 4 + fileName.length + tag.length;
    const procIdModRegDataSize = 4 + 4 + 4 + modeRegDataSize + 4;

    const data = new Uint8Array([
      1,
      0,
      0,
      0, // NumProcIDs = 1
      ...new Uint8Array(new Uint32Array([procIdModRegDataSize]).buffer), // ProcIDModRegDataSize
      100,
      0,
      0,
      0, // ProcID = 100
      1,
      0,
      0,
      0, // NumMIDs = 1
      1,
      0,
      0,
      0, // Structure Version = 1
      ...new Uint8Array(new Uint32Array([modeRegDataSize]).buffer), // ModeRegDataSize
      1,
      0, // Interface Type = 1
      2,
      0, // Interface Version = 2
      3,
      0,
      0,
      0, // Module Type = 3 (read as uint16, skip 2)
      200,
      0,
      0,
      0, // Module ID = 200
      fileName.length,
      0, // File Name Length (read as uint8, skip 1)
      tag.length,
      0, // Tag Length
      0,
      0,
      0,
      0, // Error Code = 0
      ...new TextEncoder().encode(fileName), // File Name
      ...new TextEncoder().encode(tag), // Tag
    ]);

    const context: ChunkParseContext = {
      rawChunks: new Map([[ACDB_RAW_CHUNK_TYPES.MODULE_MANAGER, data]]),
    };
    const result = parser.parse(context);

    expect(result.chunkType).toBe('MODULE_MANAGER');
    expect(result.registrations.size).toBe(1);
    expect(result.registrations.has(100)).toBe(true);

    const procRegistrations = result.registrations.get(100);
    expect(procRegistrations?.size).toBe(1);
    expect(procRegistrations?.has(200)).toBe(true);

    const registration = procRegistrations?.get(200);
    expect(registration?.interfaceType).toBe(1);
    expect(registration?.interfaceVersion).toBe(2);
    expect(registration?.capi.moduleType).toBe(3);
    expect(registration?.capi.moduleId).toBe(200);
    expect(registration?.capi.fileName).toBe(fileName);
    expect(registration?.capi.tag).toBe(tag);
    expect(registration?.capi.errorCode).toBe(0);
  });

  it('should correctly skip padding bytes after mode registration data', () => {
    const fileName = 'test.so';
    const tag = 'v1.0';

    // Calculate sizes
    const modeRegDataSize =
      4 + 4 + 4 + 2 + 2 + 4 + fileName.length + tag.length;
    // Add extra padding bytes (3 bytes) to test alignment skip logic
    const paddingBytes = 3;
    const procIdModRegDataSize = 4 + 4 + 4 + modeRegDataSize + paddingBytes + 4;

    const data = new Uint8Array([
      1,
      0,
      0,
      0, // NumProcIDs = 1
      ...new Uint8Array(new Uint32Array([procIdModRegDataSize]).buffer), // ProcIDModRegDataSize
      100,
      0,
      0,
      0, // ProcID = 100
      1,
      0,
      0,
      0, // NumMIDs = 1
      1,
      0,
      0,
      0, // Structure Version = 1
      ...new Uint8Array(new Uint32Array([modeRegDataSize]).buffer), // ModeRegDataSize
      1,
      0, // Interface Type = 1
      2,
      0, // Interface Version = 2
      3,
      0,
      0,
      0, // Module Type = 3 (read as uint16, skip 2)
      200,
      0,
      0,
      0, // Module ID = 200
      fileName.length,
      0, // File Name Length (read as uint8, skip 1)
      tag.length,
      0, // Tag Length
      0,
      0,
      0,
      0, // Error Code = 0
      ...new TextEncoder().encode(fileName), // File Name
      ...new TextEncoder().encode(tag), // Tag
      // Add padding bytes that should be skipped
      0xff,
      0xff,
      0xff, // 3 padding bytes
    ]);

    const context: ChunkParseContext = {
      rawChunks: new Map([[ACDB_RAW_CHUNK_TYPES.MODULE_MANAGER, data]]),
    };
    const result = parser.parse(context);

    expect(result.chunkType).toBe('MODULE_MANAGER');
    expect(result.registrations.size).toBe(1);
    expect(result.registrations.has(100)).toBe(true);

    const procRegistrations = result.registrations.get(100);
    expect(procRegistrations?.size).toBe(1);
    expect(procRegistrations?.has(200)).toBe(true);

    const registration = procRegistrations?.get(200);
    expect(registration?.interfaceType).toBe(1);
    expect(registration?.interfaceVersion).toBe(2);
    expect(registration?.capi.moduleType).toBe(3);
    expect(registration?.capi.moduleId).toBe(200);
    expect(registration?.capi.fileName).toBe(fileName);
    expect(registration?.capi.tag).toBe(tag);
    expect(registration?.capi.errorCode).toBe(0);
  });

  it('should handle various padding sizes correctly', () => {
    const fileName = 'a.so';
    const tag = 'v1';

    // Test with 1 byte padding
    const modeRegDataSize =
      4 + 4 + 4 + 2 + 2 + 4 + fileName.length + tag.length;
    const paddingBytes = 1;
    const procIdModRegDataSize = 4 + 4 + 4 + modeRegDataSize + paddingBytes + 4;

    const data = new Uint8Array([
      1,
      0,
      0,
      0, // NumProcIDs = 1
      ...new Uint8Array(new Uint32Array([procIdModRegDataSize]).buffer),
      100,
      0,
      0,
      0, // ProcID = 100
      1,
      0,
      0,
      0, // NumMIDs = 1
      1,
      0,
      0,
      0, // Structure Version = 1
      ...new Uint8Array(new Uint32Array([modeRegDataSize]).buffer),
      1,
      0, // Interface Type
      1,
      0, // Interface Version
      1,
      0,
      0,
      0, // Module Type
      200,
      0,
      0,
      0, // Module ID
      fileName.length,
      0, // File Name Length
      tag.length,
      0, // Tag Length
      0,
      0,
      0,
      0, // Error Code
      ...new TextEncoder().encode(fileName),
      ...new TextEncoder().encode(tag),
      0xff, // 1 padding byte
    ]);

    const context: ChunkParseContext = {
      rawChunks: new Map([[ACDB_RAW_CHUNK_TYPES.MODULE_MANAGER, data]]),
    };
    const result = parser.parse(context);

    expect(result.registrations.size).toBe(1);
    const registration = result.registrations.get(100)?.get(200);
    expect(registration?.capi.fileName).toBe(fileName);
    expect(registration?.capi.tag).toBe(tag);
  });
});
