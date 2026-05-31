/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {AudioCalibrationChunk} from '../../../../src/application/file-operations/shared/acdb-chunks/audio-calibration-chunk.js';
import {PARSED_CHUNK_TYPES} from '../../../../src/application/file-operations/shared/constants/chunk-types.js';
import type {
  CalDefinitionEntry,
  CalDataOffsetEntry,
  CkvLookupTable,
  SubgraphLookupEntry,
} from '../../../../src/application/file-operations/shared/acdb-chunks/audio-calibration-chunk.js';

describe('AudioCalibrationChunk', () => {
  describe('AudioCalibrationChunk class', () => {
    it('should have correct chunk type', () => {
      const chunk = new AudioCalibrationChunk();
      expect(chunk.chunkType).toBe(PARSED_CHUNK_TYPES.AUDIO_CALIBRATION_DATA);
    });

    it('should initialize with empty subgraphLookupEntries array', () => {
      const chunk = new AudioCalibrationChunk();
      expect(chunk.subgraphLookupEntries).toEqual([]);
    });

    it('should be serializable with structuredClone', () => {
      const chunk = new AudioCalibrationChunk();
      const subgraphLookupEntry: SubgraphLookupEntry = {
        subgraphId: 1,
        calKeyTableEntries: [
          {
            offsetCalKeyTable: 100,
            offsetCalLookupTable: 200,
          },
        ],
      };
      chunk.subgraphLookupEntries.push(subgraphLookupEntry);

      const cloned = structuredClone(chunk);

      expect(cloned.subgraphLookupEntries).toEqual(chunk.subgraphLookupEntries);
      expect(cloned.chunkType).toBe(PARSED_CHUNK_TYPES.AUDIO_CALIBRATION_DATA);
    });
  });

  describe('Cache Operations', () => {
    let chunk: AudioCalibrationChunk;

    beforeEach(() => {
      chunk = new AudioCalibrationChunk();
    });

    describe('CalKeyTable Cache', () => {
      it('should store and retrieve key table', () => {
        const offset = 100;
        const keyIds = [1, 2, 3, 4];

        chunk.setCalKeyTableAt(offset, keyIds);
        const retrieved = chunk.getCalKeyTable(offset);

        expect(retrieved).toEqual(keyIds);
      });

      it('should return undefined for non-existent offset', () => {
        const retrieved = chunk.getCalKeyTable(999);
        expect(retrieved).toBeUndefined();
      });

      it('should handle multiple key tables', () => {
        chunk.setCalKeyTableAt(100, [1, 2, 3]);
        chunk.setCalKeyTableAt(200, [4, 5, 6]);

        expect(chunk.getCalKeyTable(100)).toEqual([1, 2, 3]);
        expect(chunk.getCalKeyTable(200)).toEqual([4, 5, 6]);
      });
    });

    describe('CkvLookupTable Cache', () => {
      it('should store and retrieve CKV LUT table', () => {
        const offset = 100;
        const table: CkvLookupTable = {
          numCalKeyValues: 2,
          ckvLookupEntries: [
            {
              calKeyValues: [10, 20],
              offsetCalDefinition: 300,
              offsetCalDataOffset: 400,
              offsetDOT2: 500,
            },
          ],
        };

        chunk.setCkvLookupTableAt(offset, table);
        const retrieved = chunk.getCkvLookupTable(offset);

        expect(retrieved).toEqual(table);
      });

      it('should return undefined for non-existent offset', () => {
        const retrieved = chunk.getCkvLookupTable(999);
        expect(retrieved).toBeUndefined();
      });

      it('should handle multiple CKV LUT tables', () => {
        const table1: CkvLookupTable = {
          numCalKeyValues: 1,
          ckvLookupEntries: [],
        };
        const table2: CkvLookupTable = {
          numCalKeyValues: 2,
          ckvLookupEntries: [],
        };

        chunk.setCkvLookupTableAt(100, table1);
        chunk.setCkvLookupTableAt(200, table2);

        expect(chunk.getCkvLookupTable(100)).toEqual(table1);
        expect(chunk.getCkvLookupTable(200)).toEqual(table2);
      });
    });

    describe('CalDefinitionEntry Cache', () => {
      it('should store and retrieve CalDefinition entry', () => {
        const offset = 100;
        const entry: CalDefinitionEntry = {
          calIdEntries: [
            {moduleInstanceId: 1, paramId: 10},
            {moduleInstanceId: 2, paramId: 20},
          ],
        };

        chunk.setCalDefinitionEntryAt(offset, entry);
        const retrieved = chunk.getCalDefinitionEntry(offset);

        expect(retrieved).toEqual(entry);
      });

      it('should return undefined for non-existent offset', () => {
        const retrieved = chunk.getCalDefinitionEntry(999);
        expect(retrieved).toBeUndefined();
      });

      it('should handle multiple CalDefinition entries', () => {
        const entry1: CalDefinitionEntry = {
          calIdEntries: [{moduleInstanceId: 1, paramId: 10}],
        };
        const entry2: CalDefinitionEntry = {
          calIdEntries: [{moduleInstanceId: 2, paramId: 20}],
        };

        chunk.setCalDefinitionEntryAt(100, entry1);
        chunk.setCalDefinitionEntryAt(200, entry2);

        expect(chunk.getCalDefinitionEntry(100)).toEqual(entry1);
        expect(chunk.getCalDefinitionEntry(200)).toEqual(entry2);
      });
    });

    describe('CalDataOffsetEntry Cache', () => {
      it('should store and retrieve CalDataOffset entry', () => {
        const offset = 100;
        const entry: CalDataOffsetEntry = {
          calDataOffsets: [1000, 2000, 3000],
        };

        chunk.setCalDataOffsetEntryAt(offset, entry);
        const retrieved = chunk.getCalDataOffsetEntry(offset);

        expect(retrieved).toEqual(entry);
      });

      it('should return undefined for non-existent offset', () => {
        const retrieved = chunk.getCalDataOffsetEntry(999);
        expect(retrieved).toBeUndefined();
      });

      it('should handle multiple CalDataOffset entries', () => {
        const entry1: CalDataOffsetEntry = {calDataOffsets: [1000]};
        const entry2: CalDataOffsetEntry = {calDataOffsets: [2000]};

        chunk.setCalDataOffsetEntryAt(100, entry1);
        chunk.setCalDataOffsetEntryAt(200, entry2);

        expect(chunk.getCalDataOffsetEntry(100)).toEqual(entry1);
        expect(chunk.getCalDataOffsetEntry(200)).toEqual(entry2);
      });
    });
  });

  describe('getAllSubgraphIds', () => {
    it('should return empty array when no entries', () => {
      const chunk = new AudioCalibrationChunk();
      expect(chunk.getAllSubgraphIds()).toEqual([]);
    });

    it('should return all subgraph IDs', () => {
      const chunk = new AudioCalibrationChunk();
      chunk.subgraphLookupEntries = [
        {subgraphId: 1, calKeyTableEntries: []},
        {subgraphId: 2, calKeyTableEntries: []},
        {subgraphId: 3, calKeyTableEntries: []},
      ];

      expect(chunk.getAllSubgraphIds()).toEqual([1, 2, 3]);
    });

    it('should handle single subgraph', () => {
      const chunk = new AudioCalibrationChunk();
      chunk.subgraphLookupEntries = [{subgraphId: 42, calKeyTableEntries: []}];

      expect(chunk.getAllSubgraphIds()).toEqual([42]);
    });
  });

  describe('getSubgraphCount', () => {
    it('should return 0 when no entries', () => {
      const chunk = new AudioCalibrationChunk();
      expect(chunk.getSubgraphCount()).toBe(0);
    });

    it('should return correct count', () => {
      const chunk = new AudioCalibrationChunk();
      chunk.subgraphLookupEntries = [
        {subgraphId: 1, calKeyTableEntries: []},
        {subgraphId: 2, calKeyTableEntries: []},
        {subgraphId: 3, calKeyTableEntries: []},
      ];

      expect(chunk.getSubgraphCount()).toBe(3);
    });

    it('should return 1 for single subgraph', () => {
      const chunk = new AudioCalibrationChunk();
      chunk.subgraphLookupEntries = [{subgraphId: 1, calKeyTableEntries: []}];

      expect(chunk.getSubgraphCount()).toBe(1);
    });
  });

  describe('Integration', () => {
    it('should handle complete workflow', () => {
      const chunk = new AudioCalibrationChunk();

      // Add subgraph entry
      const subgraphLookupEntry: SubgraphLookupEntry = {
        subgraphId: 1,
        calKeyTableEntries: [
          {
            offsetCalKeyTable: 100,
            offsetCalLookupTable: 200,
          },
        ],
      };
      chunk.subgraphLookupEntries.push(subgraphLookupEntry);

      // Cache key table
      chunk.setCalKeyTableAt(100, [1, 2, 3]);

      // Cache CKV LUT table
      const ckvLookupTable: CkvLookupTable = {
        numCalKeyValues: 2,
        ckvLookupEntries: [
          {
            calKeyValues: [10, 20],
            offsetCalDefinition: 300,
            offsetCalDataOffset: 400,
            offsetDOT2: 500,
          },
        ],
      };
      chunk.setCkvLookupTableAt(200, ckvLookupTable);

      // Cache DEF and DOT entries
      chunk.setCalDefinitionEntryAt(300, {
        calIdEntries: [{moduleInstanceId: 1, paramId: 10}],
      });
      chunk.setCalDataOffsetEntryAt(400, {calDataOffsets: [1000]});

      // Verify all data is accessible
      expect(chunk.getSubgraphCount()).toBe(1);
      expect(chunk.getAllSubgraphIds()).toEqual([1]);
      expect(chunk.getCalKeyTable(100)).toEqual([1, 2, 3]);
      expect(chunk.getCkvLookupTable(200)).toEqual(ckvLookupTable);
      expect(chunk.getCalDefinitionEntry(300)).toBeDefined();
      expect(chunk.getCalDataOffsetEntry(400)).toBeDefined();
    });
  });
});
