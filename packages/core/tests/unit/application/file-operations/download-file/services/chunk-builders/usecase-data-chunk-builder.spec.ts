/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {UsecaseDataChunkBuilder} from '../../../../../../../src/application/file-operations/download-file/services/chunk-builders/usecase-data-chunk-builder.js';
import type {UsecaseDataDownloadModel} from '../../../../../../../src/application/ports/persistence/query-services/bulk-read/bulk-read-query-service.js';
import {PARSED_CHUNK_TYPES} from '../../../../../../../src/application/file-operations/shared/constants/chunk-types.js';

describe('UsecaseDataChunkBuilder', () => {
  describe('buildChunk', () => {
    it('should build chunk with gkvGroups structure', () => {
      const usecaseData: UsecaseDataDownloadModel[] = [
        {
          systemId: 1,
          keyIds: [100, 200],
          valueIds: [1001, 2001],
          subgraphIds: [5000, 5001],
          subgraphPairs: [
            {sourceSubgraphNaturalId: 5000, destSubgraphNaturalId: 5001},
          ],
        },
      ];

      const chunk = UsecaseDataChunkBuilder.buildChunk({usecaseData});

      expect(chunk.chunkType).toBe(PARSED_CHUNK_TYPES.USECASE_DATA);
      expect(chunk.gkvGroups).toHaveLength(1);
      expect(chunk.gkvGroups[0].numKeys).toBe(2);
      expect(chunk.gkvGroups[0].keys).toHaveLength(1);
      expect(chunk.gkvGroups[0].keys[0].keyIds).toEqual([100, 200]);
      expect(chunk.gkvGroups[0].keys[0].values).toHaveLength(1);
      expect(chunk.gkvGroups[0].keys[0].values[0].valueIds).toEqual([
        1001, 2001,
      ]);
      expect(chunk.gkvGroups[0].keys[0].values[0].sgList).toEqual([5000, 5001]);
      expect(chunk.gkvGroups[0].keys[0].values[0].sgPairList).toHaveLength(1);
      expect(chunk.gkvGroups[0].keys[0].values[0].sgPairList[0].source).toBe(
        5000,
      );
      expect(
        chunk.gkvGroups[0].keys[0].values[0].sgPairList[0].destination,
      ).toBe(5001);
    });

    it('should initialize offsets to 0 (assigned in Phase 2)', () => {
      const usecaseData: UsecaseDataDownloadModel[] = [
        {
          systemId: 1,
          keyIds: [100],
          valueIds: [1001],
          subgraphIds: [5000],
          subgraphPairs: [],
        },
      ];

      const chunk = UsecaseDataChunkBuilder.buildChunk({usecaseData});

      expect(chunk.gkvGroups[0].keys[0].values[0].sgListOffset).toBe(0);
      expect(chunk.gkvGroups[0].keys[0].values[0].sgPropOffset).toBe(0);
    });

    it('should handle multiple value entries with same keys', () => {
      const usecaseData: UsecaseDataDownloadModel[] = [
        {
          systemId: 1,
          keyIds: [100],
          valueIds: [1001],
          subgraphIds: [5000],
          subgraphPairs: [],
        },
        {
          systemId: 2,
          keyIds: [100],
          valueIds: [1002],
          subgraphIds: [5001],
          subgraphPairs: [],
        },
      ];

      const chunk = UsecaseDataChunkBuilder.buildChunk({usecaseData});

      // Both should be in same numKeys group (1) and same key entry
      expect(chunk.gkvGroups).toHaveLength(1);
      expect(chunk.gkvGroups[0].numKeys).toBe(1);
      expect(chunk.gkvGroups[0].keys).toHaveLength(1);
      expect(chunk.gkvGroups[0].keys[0].values).toHaveLength(2);
      expect(chunk.gkvGroups[0].keys[0].values[0].valueIds).toEqual([1001]);
      expect(chunk.gkvGroups[0].keys[0].values[1].valueIds).toEqual([1002]);
    });

    it('should group by numKeys', () => {
      const usecaseData: UsecaseDataDownloadModel[] = [
        {
          systemId: 1,
          keyIds: [100],
          valueIds: [1001],
          subgraphIds: [5000],
          subgraphPairs: [],
        },
        {
          systemId: 2,
          keyIds: [200, 300],
          valueIds: [2001, 3001],
          subgraphIds: [5001],
          subgraphPairs: [],
        },
      ];

      const chunk = UsecaseDataChunkBuilder.buildChunk({usecaseData});

      // Two numKeys groups: 1 and 2
      expect(chunk.gkvGroups).toHaveLength(2);
      expect(chunk.gkvGroups[0].numKeys).toBe(1);
      expect(chunk.gkvGroups[1].numKeys).toBe(2);
      expect(chunk.gkvGroups[0].keys[0].keyIds).toEqual([100]);
      expect(chunk.gkvGroups[1].keys[0].keyIds).toEqual([200, 300]);
    });

    it('should handle empty usecase data', () => {
      const chunk = UsecaseDataChunkBuilder.buildChunk({usecaseData: []});

      expect(chunk.gkvGroups).toEqual([]);
    });

    it('should preserve subgraph pair order', () => {
      const usecaseData: UsecaseDataDownloadModel[] = [
        {
          systemId: 1,
          keyIds: [100],
          valueIds: [1001],
          subgraphIds: [5000, 5001, 5002],
          subgraphPairs: [
            {sourceSubgraphNaturalId: 5000, destSubgraphNaturalId: 5001},
            {sourceSubgraphNaturalId: 5001, destSubgraphNaturalId: 5002},
            {sourceSubgraphNaturalId: 5000, destSubgraphNaturalId: 5002},
          ],
        },
      ];

      const chunk = UsecaseDataChunkBuilder.buildChunk({usecaseData});

      const valueEntry = chunk.gkvGroups[0].keys[0].values[0];
      expect(valueEntry.sgPairList).toHaveLength(3);
      expect(valueEntry.sgPairList[0].source).toBe(5000);
      expect(valueEntry.sgPairList[0].destination).toBe(5001);
      expect(valueEntry.sgPairList[1].source).toBe(5001);
      expect(valueEntry.sgPairList[1].destination).toBe(5002);
      expect(valueEntry.sgPairList[2].source).toBe(5000);
      expect(valueEntry.sgPairList[2].destination).toBe(5002);
    });

    it('should deduplicate keys within numKeys groups', () => {
      const usecaseData: UsecaseDataDownloadModel[] = [
        {
          systemId: 1,
          keyIds: [100, 200],
          valueIds: [1001, 2001],
          subgraphIds: [5000],
          subgraphPairs: [],
        },
        {
          systemId: 2,
          keyIds: [100, 200],
          valueIds: [1002, 2002],
          subgraphIds: [5001],
          subgraphPairs: [],
        },
        {
          systemId: 3,
          keyIds: [300, 400],
          valueIds: [3001, 4001],
          subgraphIds: [5002],
          subgraphPairs: [],
        },
      ];

      const chunk = UsecaseDataChunkBuilder.buildChunk({usecaseData});

      // One numKeys group (2), two unique key combinations
      expect(chunk.gkvGroups).toHaveLength(1);
      expect(chunk.gkvGroups[0].numKeys).toBe(2);
      expect(chunk.gkvGroups[0].keys).toHaveLength(2);
      expect(chunk.gkvGroups[0].keys[0].keyIds).toEqual([100, 200]);
      expect(chunk.gkvGroups[0].keys[0].values).toHaveLength(2);
      expect(chunk.gkvGroups[0].keys[1].keyIds).toEqual([300, 400]);
      expect(chunk.gkvGroups[0].keys[1].values).toHaveLength(1);
    });
  });
});
