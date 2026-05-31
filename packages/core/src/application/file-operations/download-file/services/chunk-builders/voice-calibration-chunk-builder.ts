/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {VoiceCalibrationChunk} from '../../../shared/acdb-chunks/voice-calibration-chunk.js';
import type {
  VoiceSubgraphCalTable,
  VoiceMasterKeyTable,
  VoiceCalKeyTable,
  VoiceCkvDataTable,
  VoiceCalDataObject,
  VoiceCkvLookupTable,
  VoiceCkvLookupEntry,
  VoiceCalDefinitionEntry,
} from '../../../shared/acdb-chunks/voice-calibration-chunk.js';
import type {CalibrationDataDownloadModel} from '../../../../ports/persistence/query-services/bulk-read/bulk-read-query-service.js';
import type {DatapoolChunk} from '../../../shared/acdb-chunks/datapool-chunk.js';

/**
 * Input for building voice calibration chunk.
 */
export interface VoiceCalibrationChunkBuildInput {
  voiceCalibrationData: CalibrationDataDownloadModel[];
  datapool: DatapoolChunk;
}

/**
 * Result of voice calibration chunk building.
 */
export interface VoiceCalibrationChunkBuildResult {
  chunk: VoiceCalibrationChunk;
}

/**
 * Builder for voice calibration chunk from database entities.
 * Converts database structure back to chunk structure for serialization.
 *
 * Voice calibration building is sequential because it mutates the shared
 * datapool while assigning optimized calibration data offsets.
 */
export const VoiceCalibrationChunkBuilder = {
  /**
   * Build voice calibration chunk from database entities.
   * This is the worker handler function.
   *
   * @param input - Voice calibration data from database with natural IDs
   * @returns Chunk structure and metadata for DOT entry creation
   */
  buildChunk(
    input: VoiceCalibrationChunkBuildInput,
  ): VoiceCalibrationChunkBuildResult {
    const chunk = new VoiceCalibrationChunk();
    const {datapool} = input;

    for (let sgIdx = 0; sgIdx < input.voiceCalibrationData.length; sgIdx++) {
      const sgData = input.voiceCalibrationData[sgIdx];
      // Build master key table and get offset
      const masterKeyTable: VoiceMasterKeyTable = {
        keyInfos: sgData.masterKeys.map(mk => ({
          voiceKeyId: mk.keyId,
          isDynamic: mk.isDynamic,
        })),
      };
      const masterKeyOffset = chunk.addMasterKeyTable(masterKeyTable);

      // Build CKV data tables (one per unique key combination)
      const voiceCkvDataTables: VoiceCkvDataTable[] = [];

      for (
        let ckvIdx = 0;
        ckvIdx < sgData.keyValueCombinations.length;
        ckvIdx++
      ) {
        const kvCombo = sgData.keyValueCombinations[ckvIdx];
        // Build cal key table and get offset
        const calKeyTable: VoiceCalKeyTable = {
          voiceKeyIds: kvCombo.keyIds,
        };
        const calKeyOffset = chunk.addCalKeyTable(calKeyTable);

        // Build cal data objects (one per module)
        const calDataObjects: VoiceCalDataObject[] = [];

        for (let objIdx = 0; objIdx < kvCombo.modules.length; objIdx++) {
          const module = kvCombo.modules[objIdx];
          // Build CKV LUT entry
          const ckvLutEntry: VoiceCkvLookupEntry = {
            voiceCalKeyValues: kvCombo.valueIds,
          };

          // Build CKV LUT table and get offset
          const ckvLutTable: VoiceCkvLookupTable = {
            numVoiceCalKeyValues: kvCombo.keyIds.length,
            voiceCkvLookupEntries: [ckvLutEntry],
          };
          const ckvLutOffset = chunk.addCkvLookupTable(ckvLutTable);

          // Build DEF entry and get offset
          const defEntry: VoiceCalDefinitionEntry = {
            moduleInstanceParamPairs: module.parameters.map(p => ({
              moduleInstanceId: module.moduleInstanceId,
              paramId: p.parameterId,
            })),
          };
          const defOffset = chunk.addCalDefinitionEntry(defEntry);

          const offsetsInGlobalDataPool = module.parameters.map(param =>
            datapool.addOrReuse(param.payload),
          );

          // Build cal data object with actual offsets
          const calDataObj: VoiceCalDataObject = {
            offsetVoiceCkvLookupTable: ckvLutOffset,
            offsetVoiceCalDefinitionTable: defOffset,
            numModuleInstanceParamPairs: module.parameters.length,
            offsetsInGlobalDataPool,
          };

          calDataObjects.push(calDataObj);
        }

        // Build CKV data table with actual offset
        const ckvDataTable: VoiceCkvDataTable = {
          voiceCkvDataTableSize: 0, // Will be calculated during serialization
          offsetVoiceCalKeyTable: calKeyOffset,
          dataOffsetTableSize: 0, // Will be calculated during serialization
          calDataObjects,
        };

        voiceCkvDataTables.push(ckvDataTable);
      }

      // Build subgraph cal table with actual offset
      const sgCalTable: VoiceSubgraphCalTable = {
        subgraphId: sgData.subgraphId,
        subgraphCalTableSize: 0, // Will be calculated during serialization
        majorVersion: 1,
        minorVersion: 0,
        offsetVoiceMasterKeyTable: masterKeyOffset,
        voiceCkvDataTables,
      };

      chunk.subgraphCalTables.push(sgCalTable);
    }

    return {chunk};
  },
};
