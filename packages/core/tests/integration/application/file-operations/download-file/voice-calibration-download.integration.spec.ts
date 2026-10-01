/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {AcdbFileSerializer} from '../../../../../src/application/file-operations/download-file/services/acdb-file-serializer.js';
import type {DownloadEntities} from '../../../../../src/application/ports/persistence/query-services/bulk-read/bulk-read-query-service.js';
import {
  SUB_GRAPH_PROP_ID_SCENARIO_ID,
  SUB_GRAPH_PROP_ID_SCENARIO_VALUE_VOICE_CALL,
} from '../../../../../src/domain/entities/definitions/subgraph/subgraph-ids.js';

/**
 * Build a 4-byte little-endian payload for the scenario ID property.
 */
function makeScenarioPayload(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  buf[0] = value & 0xff;
  return buf;
}

function containsChunkId(acdbFile: Uint8Array, chunkId: string): boolean {
  const view = new DataView(
    acdbFile.buffer,
    acdbFile.byteOffset,
    acdbFile.byteLength,
  );
  let pos = 12; // skip file header: [4 magic][4 type][4 fileLen]
  while (pos + 8 <= acdbFile.byteLength) {
    const id = String.fromCharCode(
      acdbFile[pos],
      acdbFile[pos + 1],
      acdbFile[pos + 2],
      acdbFile[pos + 3],
    );
    const len = view.getUint32(pos + 4, true);
    if (id === chunkId) return true;
    pos += 8 + len;
  }
  return false;
}

describe('Voice Calibration Download Integration', () => {
  it('should serialize voice calibration data to ACDB file', async () => {
    // Arrange: subgraphData includes scenario property so the serializer can
    // identify subgraph 100 as voice via isVoiceSubgraph().
    const entities: DownloadEntities = {
      headerMetadata: {
        version: {major: 2, minor: 3, revision: 4, cplInfo: 5},
        codecInfos: [],
        modifiedDate: Date.now(),
        oemInfo: 'Test OEM',
      },
      subgraphData: [
        {
          subgraphId: 100,
          properties: [
            {
              propertyId: SUB_GRAPH_PROP_ID_SCENARIO_ID,
              payload: makeScenarioPayload(
                SUB_GRAPH_PROP_ID_SCENARIO_VALUE_VOICE_CALL,
              ),
            },
          ],
          modules: [],
          dataLinks: [],
          controlLinks: [],
          voiceTags: [],
        },
      ],
      calibrationData: [
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
                  naturalId: 300,
                  parameters: [
                    {
                      naturalId: 400,
                      payload: new Uint8Array([0xde, 0xad]),
                      pidType: 'SharedPersistent',
                    },
                    {
                      naturalId: 401,
                      payload: new Uint8Array([0xbe, 0xef]),
                      pidType: 'SharedPersistent',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const serializer = new AcdbFileSerializer();

    // Act
    const result = await serializer.serialize(entities);

    // Assert
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);

    const view = new DataView(result.buffer);
    const fileId = view.getUint32(0, true);
    expect(fileId).toBe(0x42444341); // 'ACDB' in little-endian
  });

  it('should include vcpm calibration data merged into voice calibration output', async () => {
    const entities: DownloadEntities = {
      headerMetadata: {
        version: {major: 2, minor: 3, revision: 4, cplInfo: 5},
        codecInfos: [],
        modifiedDate: Date.now(),
        oemInfo: 'Test OEM',
      },
      subgraphData: [
        {
          subgraphId: 100,
          properties: [
            {
              propertyId: SUB_GRAPH_PROP_ID_SCENARIO_ID,
              payload: makeScenarioPayload(
                SUB_GRAPH_PROP_ID_SCENARIO_VALUE_VOICE_CALL,
              ),
            },
          ],
          modules: [],
          dataLinks: [],
          controlLinks: [],
          voiceTags: [],
        },
      ],
      calibrationData: [],
      vcpmCalibrationData: [
        {
          subgraphId: 100,
          masterKeys: [{keyId: 1, isDynamic: true}],
          keyValueCombinations: [
            {
              keyIds: [1],
              valueIds: [10],
              modules: [
                {
                  moduleInstanceId: 4, // SPF_VCPM_MODULE_ID
                  parameters: [
                    {
                      parameterId: 0x08001163,
                      payload: new Uint8Array([0xca, 0xfe]),
                      pidType: '',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const serializer = new AcdbFileSerializer();
    const result = await serializer.serialize(entities);

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
    expect(containsChunkId(result, 'VCCD')).toBe(true);
  });
});
