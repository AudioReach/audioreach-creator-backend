/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DriverCalibrationChunk} from '../../../shared/acdb-chunks/driver-calibration-chunk.js';
import type {
  ModuleLookupEntry,
  CkvLookupEntry,
  CalDefinitionEntry,
} from '../../../shared/acdb-chunks/driver-calibration-chunk.js';
import type {DriverCalibrationDownloadModel} from '../../../../ports/persistence/query-services/bulk-read/bulk-read-query-service.js';
import type {DatapoolChunk} from '../../../shared/acdb-chunks/datapool-chunk.js';
import {compareNumberArrays} from '../../../../../shared/utilities/array-utils.js';

export interface DriverCalibrationChunkBuildInput {
  driverCalibrationData: DriverCalibrationDownloadModel[];
  datapool: DatapoolChunk;
}

export interface DriverCalibrationChunkBuildResult {
  chunk: DriverCalibrationChunk;
}

/**
 * Builds a DriverCalibrationChunk from database entities.
 *
 * Follows the same pattern as AudioCalibrationChunkBuilder:
 *   - Populates a DriverCalibrationChunk object via chunk.add*() calls
 *   - Serialization to binary is delegated to DriverCalibrationChunkSerializer
 *
 * Sorting in following ordering:
 *   outer: moduleDefinitionId ASC
 *   middle: keyIds lex ASC  (IKeys)
 *   inner: valueIds lex ASC (IValues)
 *   params: parameterId ASC (CdftIds)
 */
export const DriverCalibrationChunkBuilder = {
  buildChunk(
    input: DriverCalibrationChunkBuildInput,
  ): DriverCalibrationChunkBuildResult {
    const chunk = new DriverCalibrationChunk();
    const {datapool} = input;

    const sorted = [...input.driverCalibrationData].sort((a, b) => {
      if (a.moduleDefinitionId !== b.moduleDefinitionId) {
        return a.moduleDefinitionId - b.moduleDefinitionId;
      }
      return compareNumberArrays(a.keyIds, b.keyIds);
    });

    for (const entry of sorted) {
      const sortedCkvs = [...entry.ckvs].sort((a, b) =>
        compareNumberArrays(a.valueIds, b.valueIds),
      );

      // Add key table for this (MID, keySet) group
      const keyTableOffset = chunk.addCalKeyTable(entry.keyIds);

      // Build CKV entries
      const ckvEntries: CkvLookupEntry[] = buildCkvEntries(
        sortedCkvs,
        chunk,
        datapool,
      );

      const ckvLutOffset = chunk.addCkvLookupTable({
        numCalKeyValues: entry.keyIds.length,
        ckvLookupEntries: ckvEntries,
      });

      const moduleLutEntry: ModuleLookupEntry = {
        moduleDefinitionId: entry.moduleDefinitionId,
        calKeyTableEntries: [
          {
            offsetCalKeyTable: keyTableOffset,
            offsetCalLookupTable: ckvLutOffset,
          },
        ],
      };
      chunk.moduleLookupEntries.push(moduleLutEntry);
    }

    return {chunk};
  },
};

function buildCkvEntries(
  sortedCkvs: DriverCalibrationDownloadModel['ckvs'],
  chunk: DriverCalibrationChunk,
  datapool: DatapoolChunk,
): CkvLookupEntry[] {
  return sortedCkvs.map(ckv => {
    const sortedParams = [...ckv.parameters].sort(
      (a, b) => a.parameterId - b.parameterId,
    );

    const defEntry: CalDefinitionEntry = {
      calIdEntries: sortedParams.map(p => ({paramId: p.parameterId})),
    };
    const defOffset = chunk.addCalDefinitionEntry(defEntry);

    const poolOffsets = sortedParams.map(p => datapool.addOrReuse(p.payload));
    const dotOffset = chunk.addCalDataOffsetEntry({
      calDataOffsets: poolOffsets,
    });

    return {
      calKeyValues: ckv.valueIds,
      offsetCalDefinition: defOffset,
      offsetCalDataOffset: dotOffset,
    };
  });
}
