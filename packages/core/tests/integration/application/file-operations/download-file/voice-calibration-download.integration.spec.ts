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
} from '../../../../../src/application/file-operations/shared/constants/spf-ids.js';

/**
 * Build a 4-byte little-endian payload for the scenario ID property.
 */
function makeScenarioPayload(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  buf[0] = value & 0xff;
  return buf;
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
                  moduleInstanceId: 300,
                  parameters: [
                    {
                      parameterId: 400,
                      payload: new Uint8Array([0xde, 0xad]),
                      pidType: 'SharedPersistent',
                    },
                    {
                      parameterId: 401,
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
});
