/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {AudioCalibrationChunk} from '../../../shared/acdb-chunks/audio-calibration-chunk.js';
import type {
  SubgraphLookupEntry,
  CkvLookupEntry,
  CalDefinitionEntry,
} from '../../../shared/acdb-chunks/audio-calibration-chunk.js';
import type {CalibrationDataDownloadModel} from '../../../../ports/persistence/query-services/bulk-read/bulk-read-query-service.js';
import type {DatapoolChunk} from '../../../shared/acdb-chunks/datapool-chunk.js';

/**
 * Input for building audio calibration chunk.
 */
export interface AudioCalibrationChunkBuildInput {
  audioCalibrationData: CalibrationDataDownloadModel[];
  datapool: DatapoolChunk;
}

/**
 * Result of audio calibration chunk building.
 */
export interface AudioCalibrationChunkBuildResult {
  chunk: AudioCalibrationChunk;
}

/**
 * Group key-value combinations by unique key combination.
 */
function groupByKeyCombo(
  keyValueCombinations: CalibrationDataDownloadModel['keyValueCombinations'],
): Map<
  string,
  Array<{
    valueIds: number[];
    modules: CalibrationDataDownloadModel['keyValueCombinations'][0]['modules'];
  }>
> {
  const keyComboMap = new Map<
    string,
    Array<{
      valueIds: number[];
      modules: CalibrationDataDownloadModel['keyValueCombinations'][0]['modules'];
    }>
  >();

  for (const kvCombo of keyValueCombinations) {
    const keyStr = kvCombo.keyIds.join(',');
    if (!keyComboMap.has(keyStr)) {
      keyComboMap.set(keyStr, []);
    }
    keyComboMap.get(keyStr)!.push({
      valueIds: kvCombo.valueIds,
      modules: kvCombo.modules,
    });
  }

  return keyComboMap;
}

/**
 * Flatten all modules/parameters for a value combination.
 */
function flattenModuleParameters(
  modules: CalibrationDataDownloadModel['keyValueCombinations'][0]['modules'],
): Array<{moduleInstanceId: number; paramId: number}> {
  const allCalIdEntries: Array<{
    moduleInstanceId: number;
    paramId: number;
  }> = [];

  for (const module of modules) {
    for (const param of module.parameters) {
      allCalIdEntries.push({
        moduleInstanceId: module.moduleInstanceId,
        paramId: param.parameterId,
      });
    }
  }

  return allCalIdEntries;
}

/**
 * Build CKV entries for value combinations.
 * DEF, DOT, and DOT2 entries are built with final datapool offsets because
 * audio calibration building is intentionally sequential.
 */
function buildCkvEntries(
  valueCombos: Array<{
    valueIds: number[];
    modules: CalibrationDataDownloadModel['keyValueCombinations'][0]['modules'];
  }>,
  chunk: AudioCalibrationChunk,
  datapool: DatapoolChunk,
): CkvLookupEntry[] {
  const ckvEntries: CkvLookupEntry[] = [];

  for (const valueCombo of valueCombos) {
    const allCalIdEntries = flattenModuleParameters(valueCombo.modules);

    // Build DEF entry with ALL module/param pairs and get offset
    const defEntry: CalDefinitionEntry = {
      calIdEntries: allCalIdEntries,
    };
    const defOffset = chunk.addCalDefinitionEntry(defEntry);

    const calDataOffsets = addPayloadsToDatapool(valueCombo.modules, datapool);
    const dotOffset = chunk.addCalDataOffsetEntry({calDataOffsets});
    const dot2Offset = addGlobalPersistentIIDsByType(
      valueCombo.modules,
      datapool,
    );

    const ckvEntry: CkvLookupEntry = {
      calKeyValues: valueCombo.valueIds,
      offsetCalDefinition: defOffset,
      offsetCalDataOffset: dotOffset,
      offsetDOT2: dot2Offset,
    };

    ckvEntries.push(ckvEntry);
  }

  return ckvEntries;
}

function addPayloadsToDatapool(
  modules: CalibrationDataDownloadModel['keyValueCombinations'][0]['modules'],
  datapool: DatapoolChunk,
): number[] {
  const calDataOffsets: number[] = [];

  for (const module of modules) {
    for (const param of module.parameters) {
      calDataOffsets.push(datapool.addOrReuse(param.payload));
    }
  }

  return calDataOffsets;
}

function addGlobalPersistentIIDsByType(
  modules: CalibrationDataDownloadModel['keyValueCombinations'][0]['modules'],
  datapool: DatapoolChunk,
): number {
  const pidTypeMap = new Map<string, Set<number>>();

  for (const module of modules) {
    for (const param of module.parameters) {
      if (!pidTypeMap.has(param.pidType)) {
        pidTypeMap.set(param.pidType, new Set());
      }
      pidTypeMap.get(param.pidType)!.add(module.moduleInstanceId);
    }
  }

  const bufferSize = [...pidTypeMap.values()].reduce(
    (size, iids) => size + 4 + iids.size * 4,
    4,
  );
  const buffer = new Uint8Array(bufferSize);
  const view = new DataView(buffer.buffer);
  let offset = 0;

  view.setUint32(offset, pidTypeMap.size, true);
  offset += 4;

  for (const [pidType, iids] of pidTypeMap) {
    view.setUint32(offset, pidTypeToNumeric(pidType), true);
    offset += 4;

    for (const iid of iids) {
      view.setUint32(offset, iid, true);
      offset += 4;
    }
  }

  return datapool.addOrReuse(buffer);
}

function pidTypeToNumeric(pidType: string): number {
  const mapping: Record<string, number> = {
    None: 0,
    Shared: 1,
    GlobalShared: 2,
    SharedPersistent: 3,
    GlobalSharedPersistent: 4,
  };
  return mapping[pidType] ?? 0;
}

/**
 * Builder for audio calibration chunk from database entities.
 * Converts database structure back to chunk structure for serialization.
 *
 * Audio calibration building is sequential because it mutates the shared
 * datapool while creating optimized DOT/DOT2 offsets.
 */
export const AudioCalibrationChunkBuilder = {
  /**
   * Build audio calibration chunk from database entities.
   * This is the worker handler function.
   *
   * @param input - Audio calibration data from database with natural IDs
   * @returns Chunk structure and metadata for DOT entry creation
   */
  buildChunk(
    input: AudioCalibrationChunkBuildInput,
  ): AudioCalibrationChunkBuildResult {
    const chunk = new AudioCalibrationChunk();
    const {datapool} = input;

    // Create ONE SubgraphLookupEntry per subgraph
    for (const sgData of input.audioCalibrationData) {
      const sgLutEntry: SubgraphLookupEntry = {
        subgraphId: sgData.subgraphId,
        calKeyTableEntries: [],
      };

      // Group key-value combinations by unique key combination
      const keyComboMap = groupByKeyCombo(sgData.keyValueCombinations);

      // For each unique key combination, create a CalKeyTableEntry
      for (const [keyStr, valueCombos] of keyComboMap) {
        const keyIds = keyStr === '' ? [] : keyStr.split(',').map(Number);

        // Add key table and get its offset (with deduplication)
        const keyTableOffset = chunk.addCalKeyTable(keyIds);

        // Build CKV LUT with multiple entries (one per value combination)
        // before registering it, so CDLU offsets are calculated from the final
        // serialized table size rather than an empty 8-byte placeholder.
        const ckvEntries = buildCkvEntries(valueCombos, chunk, datapool);

        const ckvLutOffset = chunk.addCkvLookupTable({
          numCalKeyValues: keyIds.length,
          ckvLookupEntries: ckvEntries,
        });

        // Create CalKeyTableEntry with actual offsets
        const calKeyEntry = {
          offsetCalKeyTable: keyTableOffset,
          offsetCalLookupTable: ckvLutOffset,
        };
        sgLutEntry.calKeyTableEntries.push(calKeyEntry);
      }

      // Add this subgraph entry to the chunk
      chunk.subgraphLookupEntries.push(sgLutEntry);
    }

    return {chunk};
  },
};
