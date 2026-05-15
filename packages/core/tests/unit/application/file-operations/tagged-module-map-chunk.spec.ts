/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeEach} from '@jest/globals';
import {
  TaggedModuleMapChunk,
  type TaggedModuleEntry,
  type TaggedModuleDefEntry,
  type ModuleInstancePair,
} from '../../../../src/application/file-operations/shared/acdb-chunks/tagged-module-map-chunk.js';
import {PARSED_CHUNK_TYPES} from '../../../../src/application/file-operations/shared/constants/chunk-types.js';

describe('TaggedModuleMapChunk', () => {
  let chunk: TaggedModuleMapChunk;

  beforeEach(() => {
    chunk = new TaggedModuleMapChunk();
  });

  it('should have correct chunk type', () => {
    expect(chunk.chunkType).toBe(PARSED_CHUNK_TYPES.TAGGED_MODULE_MAP);
  });

  it('should initialize with empty taggedModuleEntries array', () => {
    expect(chunk.taggedModuleEntries).toEqual([]);
  });

  describe('cache operations', () => {
    it('should return undefined for non-existent cached entry', () => {
      const result = chunk.getTaggedModuleDef(100);
      expect(result).toBeUndefined();
    });

    it('should cache and retrieve TaggedModuleDefEntry', () => {
      const entry: TaggedModuleDefEntry = {
        moduleInstancePairs: [
          {moduleId: 1, instanceId: 10},
          {moduleId: 2, instanceId: 20},
        ],
      };

      chunk.setTaggedModuleDef(100, entry);
      const retrieved = chunk.getTaggedModuleDef(100);

      expect(retrieved).toEqual(entry);
    });

    it('should return same cached entry on multiple retrievals', () => {
      const entry: TaggedModuleDefEntry = {
        moduleInstancePairs: [{moduleId: 1, instanceId: 10}],
      };

      chunk.setTaggedModuleDef(200, entry);
      const first = chunk.getTaggedModuleDef(200);
      const second = chunk.getTaggedModuleDef(200);

      expect(first).toBe(second);
    });
  });
});
