/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {AudioCalibrationChunkBuilder} from '../../../../../../../src/application/file-operations/download-file/services/chunk-builders/audio-calibration-chunk-builder.js';
import {DatapoolChunk} from '../../../../../../../src/application/file-operations/shared/acdb-chunks/datapool-chunk.js';
import type {CalibrationDataDownloadModel} from '../../../../../../../src/application/ports/persistence/query-services/bulk-read/bulk-read-query-service.js';

describe('AudioCalibrationChunkBuilder', () => {
  describe('buildChunk', () => {
    it('should return empty chunk when no calibration data provided', () => {
      // Arrange
      const datapool = new DatapoolChunk();
      const input = {audioCalibrationData: [], datapool};

      // Act
      const result = AudioCalibrationChunkBuilder.buildChunk(input);

      // Assert
      expect(result.chunk.subgraphLookupEntries).toEqual([]);
    });

    it('should build chunk with single subgraph and single key-value combo', () => {
      // Arrange
      const datapool = new DatapoolChunk();
      const input: {
        audioCalibrationData: CalibrationDataDownloadModel[];
        datapool: DatapoolChunk;
      } = {
        audioCalibrationData: [
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
        ],
        datapool,
      };

      // Act
      const result = AudioCalibrationChunkBuilder.buildChunk(input);

      // Assert
      expect(result.chunk.subgraphLookupEntries).toHaveLength(1);
      expect(result.chunk.subgraphLookupEntries[0].subgraphId).toBe(100);
      expect(
        result.chunk.subgraphLookupEntries[0].calKeyTableEntries,
      ).toHaveLength(1);
      expect(
        result.chunk.subgraphLookupEntries[0].calKeyTableEntries[0]
          .offsetCalKeyTable,
      ).toBe(0);
      expect(
        result.chunk.subgraphLookupEntries[0].calKeyTableEntries[0]
          .offsetCalLookupTable,
      ).toBe(0);
    });
  });
});
