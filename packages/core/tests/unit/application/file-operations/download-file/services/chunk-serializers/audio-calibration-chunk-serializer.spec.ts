/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeEach} from '@jest/globals';
import {AudioCalibrationChunkSerializer} from '../../../../../../../src/application/file-operations/download-file/services/chunk-serializers/audio-calibration-chunk-serializer.js';
import {AudioCalibrationChunk} from '../../../../../../../src/application/file-operations/shared/acdb-chunks/audio-calibration-chunk.js';
import {DatapoolChunk} from '../../../../../../../src/application/file-operations/shared/acdb-chunks/datapool-chunk.js';
import type {CalibrationDataDownloadModel} from '../../../../../../../src/application/ports/persistence/query-services/bulk-read/bulk-read-query-service.js';

describe('AudioCalibrationChunkSerializer', () => {
  let serializer: AudioCalibrationChunkSerializer;
  let datapool: DatapoolChunk;

  beforeEach(() => {
    serializer = new AudioCalibrationChunkSerializer();
    datapool = new DatapoolChunk();
  });

  describe('serialize', () => {
    it('should return empty chunks when chunk has no data', () => {
      // Arrange
      const chunk = new AudioCalibrationChunk();
      const audioCalibrationData: CalibrationDataDownloadModel[] = [];

      // Act
      const result = serializer.serialize(
        chunk,
        datapool,
        audioCalibrationData,
      );

      // Assert
      expect(result.calSgLut).toHaveLength(0);
      expect(result.calKeyTable).toHaveLength(0);
      expect(result.ckvLut).toHaveLength(0);
      expect(result.calDef).toHaveLength(0);
      expect(result.calDot).toHaveLength(0);
    });

    it('should serialize chunk with single subgraph', () => {
      // Arrange
      const chunk = new AudioCalibrationChunk();
      chunk.subgraphLookupEntries = [
        {
          subgraphId: 100,
          calKeyTableEntries: [
            {
              offsetCalKeyTable: 0,
              offsetCalLookupTable: 0,
            },
          ],
        },
      ];

      chunk.setCalKeyTableAt(0, [1, 2]);
      chunk.setCkvLookupTableAt(0, {
        numCalKeyValues: 2,
        ckvLookupEntries: [
          {
            calKeyValues: [10, 20],
            offsetCalDefinition: 0,
            offsetCalDataOffset: 0,
            offsetDOT2: 0,
          },
        ],
      });

      chunk.setCalDefinitionEntryAt(0, {
        calIdEntries: [{moduleInstanceId: 5, paramId: 101}],
      });

      chunk.setCalDataOffsetEntryAt(0, {
        calDataOffsets: [0],
      });

      const audioCalData: CalibrationDataDownloadModel[] = [
        {
          subgraphId: 100,
          keyValueCombinations: [
            {
              keyIds: [1, 2],
              valueIds: [10, 20],
              modules: [
                {
                  moduleInstanceId: 5,
                  parameters: [
                    {
                      parameterId: 101,
                      payload: new Uint8Array([1, 2, 3, 4]),
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];

      // Act
      const result = serializer.serialize(chunk, datapool, audioCalData);

      // Assert
      expect(result.calSgLut.length).toBeGreaterThan(0);
      expect(result.calKeyTable.length).toBeGreaterThan(0);
      expect(result.ckvLut.length).toBeGreaterThan(0);
      expect(result.calDef.length).toBeGreaterThan(0);
      expect(result.calDot.length).toBeGreaterThan(0);
    });
  });
});
