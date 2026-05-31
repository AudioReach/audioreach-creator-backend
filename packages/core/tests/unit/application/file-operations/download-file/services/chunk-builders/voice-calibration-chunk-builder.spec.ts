/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {VoiceCalibrationChunkBuilder} from '../../../../../../../src/application/file-operations/download-file/services/chunk-builders/voice-calibration-chunk-builder.js';
import {DatapoolChunk} from '../../../../../../../src/application/file-operations/shared/acdb-chunks/datapool-chunk.js';
import type {VoiceCalibrationDataDownloadModel} from '../../../../../../../src/application/ports/persistence/query-services/bulk-read/bulk-read-query-service.js';

describe('VoiceCalibrationChunkBuilder', () => {
  describe('buildChunk', () => {
    it('should return empty chunk when no data provided', () => {
      // Arrange
      const datapool = new DatapoolChunk();
      const input: VoiceCalibrationDataDownloadModel[] = [];

      // Act
      const result = VoiceCalibrationChunkBuilder.buildChunk({
        voiceCalibrationData: input,
        datapool,
      });

      // Assert
      expect(result.chunk.subgraphCalTables).toEqual([]);
      expect(result.chunk.getSubgraphCount()).toBe(0);
    });

    it('should build chunk with single subgraph and master keys', () => {
      // Arrange
      const datapool = new DatapoolChunk();
      const input: VoiceCalibrationDataDownloadModel[] = [
        {
          subgraphId: 100,
          masterKeys: [
            {keyId: 1, isDynamic: true},
            {keyId: 2, isDynamic: false},
          ],
          keyValueCombinations: [
            {
              keyIds: [1, 2],
              valueIds: [10, 20],
              modules: [
                {
                  moduleInstanceId: 300,
                  parameters: [
                    {parameterId: 400, payload: new Uint8Array([0xde, 0xad])},
                    {parameterId: 401, payload: new Uint8Array([0xbe, 0xef])},
                  ],
                },
              ],
            },
          ],
        },
      ];

      // Act
      const result = VoiceCalibrationChunkBuilder.buildChunk({
        voiceCalibrationData: input,
        datapool,
      });

      // Assert
      expect(result.chunk.subgraphCalTables).toHaveLength(1);
      expect(result.chunk.subgraphCalTables[0].subgraphId).toBe(100);
      expect(result.chunk.subgraphCalTables[0].majorVersion).toBe(1);
      expect(result.chunk.subgraphCalTables[0].minorVersion).toBe(0);

      // Verify master key table cached
      const masterKeyTable = result.chunk.getMasterKeyTable(0);
      expect(masterKeyTable).toBeDefined();
      expect(masterKeyTable!.keyInfos).toHaveLength(2);
      expect(masterKeyTable!.keyInfos[0]).toEqual({
        voiceKeyId: 1,
        isDynamic: true,
      });
      expect(masterKeyTable!.keyInfos[1]).toEqual({
        voiceKeyId: 2,
        isDynamic: false,
      });

      // Verify CKV data tables
      expect(result.chunk.subgraphCalTables[0].voiceCkvDataTables).toHaveLength(
        1,
      );
      const ckvDataTable =
        result.chunk.subgraphCalTables[0].voiceCkvDataTables[0];
      expect(ckvDataTable.calDataObjects).toHaveLength(1);

      // Verify cal key table cached
      const calKeyTable = result.chunk.getCalKeyTable(0);
      expect(calKeyTable).toBeDefined();
      expect(calKeyTable!.voiceKeyIds).toEqual([1, 2]);

      // Verify CKV LUT cached
      const ckvLut = result.chunk.getCkvLookupTable(0);
      expect(ckvLut).toBeDefined();
      expect(ckvLut!.numVoiceCalKeyValues).toBe(2);
      expect(ckvLut!.voiceCkvLookupEntries).toHaveLength(1);
      expect(ckvLut!.voiceCkvLookupEntries[0].voiceCalKeyValues).toEqual([
        10, 20,
      ]);

      // Verify DEF entry cached
      const defEntry = result.chunk.getCalDefinitionEntry(0);
      expect(defEntry).toBeDefined();
      expect(defEntry!.moduleInstanceParamPairs).toHaveLength(2);
      expect(defEntry!.moduleInstanceParamPairs[0]).toEqual({
        moduleInstanceId: 300,
        paramId: 400,
      });
      expect(defEntry!.moduleInstanceParamPairs[1]).toEqual({
        moduleInstanceId: 300,
        paramId: 401,
      });

      // Verify cal data objects have datapool offsets
      const calDataObj =
        result.chunk.subgraphCalTables[0].voiceCkvDataTables[0]
          .calDataObjects[0];
      expect(calDataObj.offsetsInGlobalDataPool).toHaveLength(2);
      expect(calDataObj.offsetsInGlobalDataPool[0]).toBeGreaterThanOrEqual(0);
      expect(calDataObj.offsetsInGlobalDataPool[1]).toBeGreaterThanOrEqual(0);
    });
  });
});
