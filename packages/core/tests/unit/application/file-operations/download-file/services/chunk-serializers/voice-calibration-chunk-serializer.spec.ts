/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {VoiceCalibrationChunkSerializer} from '../../../../../../../src/application/file-operations/download-file/services/chunk-serializers/voice-calibration-chunk-serializer.js';
import {VoiceCalibrationChunk} from '../../../../../../../src/application/file-operations/shared/acdb-chunks/voice-calibration-chunk.js';
import {DatapoolChunk} from '../../../../../../../src/application/file-operations/shared/acdb-chunks/datapool-chunk.js';
import type {CalibrationDataDownloadModel} from '../../../../../../../src/application/ports/persistence/query-services/bulk-read/bulk-read-query-service.js';

describe('VoiceCalibrationChunkSerializer', () => {
  describe('serialize', () => {
    it('should return empty arrays when chunk has no data', () => {
      // Arrange
      const chunk = new VoiceCalibrationChunk();
      const datapool = new DatapoolChunk();
      const voiceCalData: CalibrationDataDownloadModel[] = [];
      const serializer = new VoiceCalibrationChunkSerializer();

      // Act
      const result = serializer.serialize(chunk);

      // Assert
      expect(result.vcpmCalData.length).toBe(0);
      expect(result.vcpmMasterKey.length).toBe(0);
      expect(result.vcpmCalKeyTable.length).toBe(0);
      expect(result.vcpmCalDataLut.length).toBe(0);
      expect(result.vcpmCalDataDef.length).toBe(0);
    });

    it('should serialize chunk with voice calibration data', () => {
      // Arrange
      const chunk = new VoiceCalibrationChunk();
      const datapool = new DatapoolChunk();

      // Build test chunk
      const masterKeyTable = {
        keyInfos: [
          {voiceKeyId: 1, isDynamic: true},
          {voiceKeyId: 2, isDynamic: false},
        ],
      };
      chunk.setMasterKeyTableAt(0, masterKeyTable);

      const calKeyTable = {voiceKeyIds: [1, 2]};
      chunk.setCalKeyTableAt(0, calKeyTable);

      const ckvLutTable = {
        numVoiceCalKeyValues: 2,
        voiceCkvLookupEntries: [{voiceCalKeyValues: [10, 20]}],
      };
      chunk.setCkvLookupTableAt(0, ckvLutTable);

      const defEntry = {
        moduleInstanceParamPairs: [
          {moduleInstanceId: 300, paramId: 400},
          {moduleInstanceId: 300, paramId: 401},
        ],
      };
      chunk.setCalDefinitionEntryAt(0, defEntry);

      const dotEntry = {offsetsInGlobalDataPool: [0, 0]};
      chunk.setCalDataOffsetEntryAt(0, dotEntry);

      const calDataObj = {
        offsetVoiceCkvLookupTable: 0,
        offsetVoiceCalDefinitionTable: 0,
        numModuleInstanceParamPairs: 2,
        offsetsInGlobalDataPool: [0, 0],
      };

      const ckvDataTable = {
        voiceCkvDataTableSize: 0,
        offsetVoiceCalKeyTable: 0,
        dataOffsetTableSize: 0,
        calDataObjects: [calDataObj],
      };

      const sgCalTable = {
        subgraphId: 100,
        subgraphCalTableSize: 0,
        majorVersion: 1,
        minorVersion: 0,
        offsetVoiceMasterKeyTable: 0,
        voiceCkvDataTables: [ckvDataTable],
      };

      chunk.subgraphCalTables.push(sgCalTable);

      const voiceCalData: CalibrationDataDownloadModel[] = [
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

      const serializer = new VoiceCalibrationChunkSerializer();

      // Act
      const result = serializer.serialize(chunk);

      // Assert
      expect(result.vcpmCalData.length).toBeGreaterThan(0);
      expect(result.vcpmMasterKey.length).toBeGreaterThan(0);
      expect(result.vcpmCalKeyTable.length).toBeGreaterThan(0);
      expect(result.vcpmCalDataLut.length).toBeGreaterThan(0);
      expect(result.vcpmCalDataDef.length).toBeGreaterThan(0);

      // Note: Datapool is updated during chunk building, not serialization
      // The serializer only converts the already-built chunk to binary format
    });
  });
});
