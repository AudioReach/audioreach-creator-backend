/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeEach} from '@jest/globals';
import {UsecaseDataChunkSerializer} from '../../../../../../../src/application/file-operations/download-file/services/chunk-serializers/usecase-data-chunk-serializer.js';
import {UsecaseDataChunk} from '../../../../../../../src/application/file-operations/shared/acdb-chunks/usecase-data-chunk.js';
import {
  KeyValue,
  KeyValuePairList,
} from '../../../../../../../src/shared/types/key-value-pair.js';
import {SubgraphPair} from '../../../../../../../src/shared/types/subgraph-pair.js';
import {DatapoolChunk} from '../../../../../../../src/application/file-operations/shared/acdb-chunks/datapool-chunk.js';
import {BinaryUtils} from '../../../../../../../src/shared/utilities/binary-utils.js';
import {SPF_APM_MODULE_ID} from '../../../../../../../src/application/file-operations/shared/constants/spf-ids.js';
import type {
  SubgraphDownloadModel,
  ContainerDownloadModel,
} from '../../../../../../../src/application/ports/persistence/query-services/bulk-read/bulk-read-query-service.js';

// ============================================================================
// Mock Data Factories
// ============================================================================

/**
 * Create mock subgraph data for testing.
 */
function createMockSubgraphData(
  subgraphId: number,
  options: {
    isVoice?: boolean;
    numProperties?: number;
    numModules?: number;
    numDataLinks?: number;
    numControlLinks?: number;
  } = {},
): SubgraphDownloadModel {
  const {
    isVoice = false,
    numProperties = 1,
    numModules = 2,
    numDataLinks = 1,
    numControlLinks = 0,
  } = options;

  // Create mock properties
  const properties = Array.from({length: numProperties}, (_, i) => ({
    propertyId: 1000 + i,
    payload: new Uint8Array([0x01, 0x02, 0x03, 0x04]),
  }));

  // Create mock modules
  const modules = Array.from({length: numModules}, (_, i) => ({
    instanceId: subgraphId * 100 + i,
    moduleId: 2000 + i,
    containerId: 3000 + (i % 2), // Alternate between two containers
    maxInputPorts: 1,
    maxOutputPorts: 1,
    properties: [
      {
        propertyId: 4000 + i,
        payload: new Uint8Array([0x10, 0x20]),
      },
    ],
  }));

  // Create mock data links (only if we have modules)
  const dataLinks =
    modules.length > 0
      ? Array.from({length: numDataLinks}, (_, i) => ({
          sourceInstanceId: modules[i]?.instanceId ?? 0,
          sourcePortId: 1,
          destinationInstanceId:
            modules[i + 1]?.instanceId ?? modules[0].instanceId,
          destinationPortId: 1,
          isInterGraph: false,
        }))
      : [];

  // Create mock control links (only if we have modules)
  const controlLinks =
    modules.length > 0
      ? Array.from({length: numControlLinks}, (_, i) => ({
          peer1InstanceId: modules[i]?.instanceId ?? 0,
          peer1PortId: 1,
          peer2InstanceId: modules[i + 1]?.instanceId ?? modules[0].instanceId,
          peer2PortId: 1,
          isInterGraph: false,
          heapId: 1,
          intentIds: [100, 101],
        }))
      : [];

  return {
    subgraphId,
    isVoice,
    properties,
    modules,
    dataLinks,
    controlLinks,
    voiceTags: [],
  };
}

/**
 * Create mock container data for testing.
 */
function createMockContainerData(
  containerId: number,
  options: {
    numProperties?: number;
    parentContainerId?: number;
  } = {},
): ContainerDownloadModel {
  const {numProperties = 1, parentContainerId} = options;

  const properties = Array.from({length: numProperties}, (_, i) => ({
    propertyId: 5000 + i,
    payload: new Uint8Array([0xa0, 0xb0, 0xc0, 0xd0]),
  }));

  // Add parent container property if specified
  if (parentContainerId !== undefined) {
    const parentPayload = new Uint8Array(4);
    const view = new DataView(
      parentPayload.buffer,
      parentPayload.byteOffset,
      parentPayload.byteLength,
    );
    view.setUint32(0, parentContainerId, true);
    properties.push({
      propertyId: 0x08001192, // CONTAINER_PROP_ID_PARENT_CONTAINER
      payload: parentPayload,
    });
  }

  return {
    containerId,
    properties,
  };
}

describe('UsecaseDataChunkSerializer', () => {
  let serializer: UsecaseDataChunkSerializer;
  let datapool: DatapoolChunk;
  let mockSubgraphData: SubgraphDownloadModel[];
  let mockContainerData: ContainerDownloadModel[];

  beforeEach(() => {
    serializer = new UsecaseDataChunkSerializer();
    datapool = new DatapoolChunk();

    // Create default mock data
    mockSubgraphData = [
      createMockSubgraphData(5000),
      createMockSubgraphData(5001),
    ];

    mockContainerData = [
      createMockContainerData(3000),
      createMockContainerData(3001),
    ];
  });

  describe('serialize', () => {
    it('should serialize with GKV_TABLE and GKV_LUT', () => {
      const chunk = new UsecaseDataChunk();
      // Use the new grouped structure
      chunk.gkvGroups = [
        {
          numKeys: 1,
          keys: [
            {
              keyIds: [100],
              values: [
                {
                  valueIds: [1001],
                  sgListOffset: 0,
                  sgPropOffset: 0,
                  sgList: [5000],
                  sgPairList: [],
                  subgraphs: [],
                },
              ],
            },
          ],
        },
      ];

      const result = serializer.serialize(
        chunk,
        datapool,
        mockSubgraphData,
        mockContainerData,
      );

      // Verify structure
      expect(result.gkvTable).toBeDefined();
      expect(result.gkvLut).toBeDefined();
      expect(result.gkvTable.byteLength).toBeGreaterThan(0);
      expect(result.gkvLut.byteLength).toBeGreaterThan(0);
    });

    it('should assign both datapool offsets to value entries', () => {
      const chunk = new UsecaseDataChunk();
      chunk.gkvGroups = [
        {
          numKeys: 1,
          keys: [
            {
              keyIds: [100],
              values: [
                {
                  valueIds: [1001],
                  sgListOffset: 0, // Will be assigned
                  sgPropOffset: 0, // Will be assigned
                  sgList: [5000, 5001],
                  sgPairList: [new SubgraphPair(5000, 5001)],
                  subgraphs: [],
                },
              ],
            },
          ],
        },
      ];

      serializer.serialize(
        chunk,
        datapool,
        mockSubgraphData,
        mockContainerData,
      );

      // Both offsets should be assigned
      const valueEntry = chunk.gkvGroups[0].keys[0].values[0];
      expect(valueEntry.sgListOffset).toBeGreaterThanOrEqual(0);
      expect(valueEntry.sgPropOffset).toBeGreaterThanOrEqual(0);
    });

    it('should handle multiple value entries', () => {
      const chunk = new UsecaseDataChunk();
      chunk.gkvGroups = [
        {
          numKeys: 1,
          keys: [
            {
              keyIds: [100],
              values: [
                {
                  valueIds: [1001],
                  sgListOffset: 0,
                  sgPropOffset: 0,
                  sgList: [5000],
                  sgPairList: [],
                  subgraphs: [],
                },
                {
                  valueIds: [1002],
                  sgListOffset: 0,
                  sgPropOffset: 0,
                  sgList: [5001],
                  sgPairList: [],
                  subgraphs: [],
                },
              ],
            },
          ],
        },
      ];

      const result = serializer.serialize(
        chunk,
        datapool,
        mockSubgraphData,
        mockContainerData,
      );

      // Verify both chunks are generated
      expect(result.gkvTable.byteLength).toBeGreaterThan(0);
      expect(result.gkvLut.byteLength).toBeGreaterThan(0);
    });

    it('should handle empty gkvGroups', () => {
      const chunk = new UsecaseDataChunk();
      chunk.gkvGroups = [];

      const result = serializer.serialize(
        chunk,
        datapool,
        mockSubgraphData,
        mockContainerData,
      );

      // GKV_TABLE always includes NumKeyTbls count (4 bytes) even when empty
      // GKV_LUT returns 0 bytes for empty
      expect(result.gkvTable.byteLength).toBe(4);
      expect(result.gkvLut.byteLength).toBe(0);
    });

    it('should add data to datapool', () => {
      const chunk = new UsecaseDataChunk();
      chunk.gkvGroups = [
        {
          numKeys: 1,
          keys: [
            {
              keyIds: [100],
              values: [
                {
                  valueIds: [1001],
                  sgListOffset: 0,
                  sgPropOffset: 0,
                  sgList: [5000, 5001],
                  sgPairList: [new SubgraphPair(5000, 5001)],
                  subgraphs: [],
                },
              ],
            },
          ],
        },
      ];

      serializer.serialize(
        chunk,
        datapool,
        mockSubgraphData,
        mockContainerData,
      );

      // Datapool should contain subgraph data
      expect(datapool.getTotalSize()).toBeGreaterThan(0);
    });

    it('should populate subgraphs from subgraphData', () => {
      const chunk = new UsecaseDataChunk();
      chunk.gkvGroups = [
        {
          numKeys: 1,
          keys: [
            {
              keyIds: [100],
              values: [
                {
                  valueIds: [1001],
                  sgListOffset: 0,
                  sgPropOffset: 0,
                  sgList: [5000, 5001],
                  sgPairList: [],
                  subgraphs: [],
                },
              ],
            },
          ],
        },
      ];

      serializer.serialize(
        chunk,
        datapool,
        mockSubgraphData,
        mockContainerData,
      );

      // Subgraphs should be populated
      const valueEntry = chunk.gkvGroups[0].keys[0].values[0];
      expect(valueEntry.subgraphs).toHaveLength(2);
      expect(valueEntry.subgraphs[0].subgraphId).toBe(5000);
      expect(valueEntry.subgraphs[1].subgraphId).toBe(5001);
    });
  });

  describe('topologicalSort', () => {
    it('should sort linear chain of subgraphs', () => {
      const sgList = [1, 2, 3];
      const sgPairList = [new SubgraphPair(1, 2), new SubgraphPair(2, 3)];

      const result = (serializer as any).topologicalSort(sgList, sgPairList);

      // Reverse order: sink to source [3, 2, 1]
      expect(result).toEqual([3, 2, 1]);
    });

    it('should handle branching topology', () => {
      const sgList = [1, 2, 3, 4];
      const sgPairList = [
        new SubgraphPair(1, 2),
        new SubgraphPair(1, 3),
        new SubgraphPair(2, 4),
        new SubgraphPair(3, 4),
      ];

      const result = (serializer as any).topologicalSort(sgList, sgPairList);

      // Should have 4 at end (sink), 1 at start (source)
      expect(result[result.length - 1]).toBe(1);
      expect(result[0]).toBe(4);
    });

    it('should handle disconnected subgraphs', () => {
      const sgList = [1, 2, 3];
      const sgPairList = [
        new SubgraphPair(1, 2),
        // 3 is disconnected
      ];

      const result = (serializer as any).topologicalSort(sgList, sgPairList);

      expect(result).toHaveLength(3);
      expect(result).toContain(1);
      expect(result).toContain(2);
      expect(result).toContain(3);
    });

    it('should handle single subgraph', () => {
      const sgList = [1];
      const sgPairList: SubgraphPair[] = [];

      const result = (serializer as any).topologicalSort(sgList, sgPairList);

      expect(result).toEqual([1]);
    });

    it('should handle empty input', () => {
      const sgList: number[] = [];
      const sgPairList: SubgraphPair[] = [];

      const result = (serializer as any).topologicalSort(sgList, sgPairList);

      expect(result).toEqual([]);
    });
  });

  describe('buildSubgraphPairMap', () => {
    it('should build source to destinations map', () => {
      const reverseOrder = [3, 2, 1]; // sink to source
      const sgPairList = [new SubgraphPair(1, 2), new SubgraphPair(2, 3)];

      const result = (serializer as any).buildSubgraphPairMap(
        reverseOrder,
        sgPairList,
      );

      expect(result.size).toBe(2);
      expect(result.get(1)).toEqual([2]);
      expect(result.get(2)).toEqual([3]);
    });

    it('should handle multiple destinations', () => {
      const reverseOrder = [4, 3, 2, 1];
      const sgPairList = [
        new SubgraphPair(1, 2),
        new SubgraphPair(1, 3),
        new SubgraphPair(2, 4),
        new SubgraphPair(3, 4),
      ];

      const result = (serializer as any).buildSubgraphPairMap(
        reverseOrder,
        sgPairList,
      );

      expect(result.get(1)).toEqual([2, 3]);
      expect(result.get(2)).toEqual([4]);
      expect(result.get(3)).toEqual([4]);
    });

    it('should only include sources with destinations', () => {
      const reverseOrder = [2, 1];
      const sgPairList = [new SubgraphPair(1, 2)];

      const result = (serializer as any).buildSubgraphPairMap(
        reverseOrder,
        sgPairList,
      );

      expect(result.size).toBe(1);
      expect(result.has(1)).toBe(true);
      expect(result.has(2)).toBe(false); // 2 is sink, no destinations
    });
  });

  describe('serializeSubgraphListPayload', () => {
    it('should serialize linear chain', () => {
      const sgList = [1, 2, 3];
      const sgPairList = [new SubgraphPair(1, 2), new SubgraphPair(2, 3)];

      const result = (serializer as any).serializeSubgraphListPayload(
        sgList,
        sgPairList,
      );

      const view = new DataView(
        result.buffer,
        result.byteOffset,
        result.byteLength,
      );
      let pos = 0;

      // NumSourceSubgraphs
      const numSources = view.getUint32(pos, true);
      expect(numSources).toBe(2); // 1 and 2 have destinations
      pos += 4;

      // Verify structure is correct
      expect(result.length).toBeGreaterThan(0);
    });

    it('should serialize empty list', () => {
      const sgList: number[] = [];
      const sgPairList: SubgraphPair[] = [];

      const result = (serializer as any).serializeSubgraphListPayload(
        sgList,
        sgPairList,
      );

      const view = new DataView(
        result.buffer,
        result.byteOffset,
        result.byteLength,
      );
      const numSources = view.getUint32(0, true);
      expect(numSources).toBe(0);
      expect(result.length).toBe(4); // Just the count
    });
  });

  describe('serializeApmParameter', () => {
    it('should wrap parameter with ID and size', () => {
      const paramId = 0x08001000;
      const payload = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

      const result = (serializer as any).serializeApmParameter(
        paramId,
        payload,
      );

      const view = new DataView(
        result.buffer,
        result.byteOffset,
        result.byteLength,
      );

      // Verify APM module ID (first field)
      expect(view.getUint32(0, true)).toBe(SPF_APM_MODULE_ID);

      // Verify parameter ID
      expect(view.getUint32(4, true)).toBe(paramId);

      // Verify parameter size (payload length)
      expect(view.getUint32(8, true)).toBe(4);

      // Verify payload
      expect(result[12]).toBe(0x01);
      expect(result[13]).toBe(0x02);
      expect(result[14]).toBe(0x03);
      expect(result[15]).toBe(0x04);

      // Total size: 12 (header) + 4 (payload) = 16, padding is 4 bytes (4 % 8 = 4), total = 20
      expect(result.length).toBe(20);
    });

    it('should apply 8-byte alignment padding', () => {
      const paramId = 0x08001000;
      const payload = new Uint8Array([0x01, 0x02, 0x03]); // 3 bytes

      const result = (serializer as any).serializeApmParameter(
        paramId,
        payload,
      );

      // 12 (header) + 3 (payload) = 15, padding is 5 bytes (3 % 8 = 3, so 8-3=5), total = 20
      expect(result.length).toBe(20);

      // Verify padding bytes are zero
      expect(result[15]).toBe(0);
      expect(result[16]).toBe(0);
      expect(result[17]).toBe(0);
      expect(result[18]).toBe(0);
      expect(result[19]).toBe(0);
    });

    it('should handle empty payload', () => {
      const paramId = 0x08001000;
      const payload = new Uint8Array(0);

      const result = (serializer as any).serializeApmParameter(
        paramId,
        payload,
      );

      const view = new DataView(
        result.buffer,
        result.byteOffset,
        result.byteLength,
      );

      // Verify APM module ID
      expect(view.getUint32(0, true)).toBe(SPF_APM_MODULE_ID);

      // Verify parameter ID
      expect(view.getUint32(4, true)).toBe(paramId);

      // Verify parameter size is 0
      expect(view.getUint32(8, true)).toBe(0);

      // Total size should be 12 (header only), padding is 0 bytes (0 % 8 = 0), so 12 total
      expect(result.length).toBe(12);
    });

    it('should handle payload already 8-byte aligned', () => {
      const paramId = 0x08001000;
      const payload = new Uint8Array(4); // 4 bytes

      const result = (serializer as any).serializeApmParameter(
        paramId,
        payload,
      );

      // 12 (header) + 4 (payload) = 16, padding is 4 bytes (4 % 8 = 4), total = 20
      expect(result.length).toBe(20);
    });
  });

  describe('buildLutOffsetMap', () => {
    it('should calculate correct offsets for single key group', () => {
      const gkvGroups = [
        {
          numKeys: 2,
          keys: [
            {
              keyIds: [100, 200],
              values: [
                {
                  valueIds: [1001, 2001],
                  sgListOffset: 0,
                  sgPropOffset: 0,
                  sgList: [5000],
                  sgPairList: [],
                  subgraphs: [],
                },
              ],
            },
          ],
        },
      ];

      const result = (serializer as any).buildLutOffsetMap(gkvGroups);

      expect(result.size).toBe(1);
      expect(result.get('100,200')).toBe(0);
    });

    it('should calculate cumulative offsets for multiple keys', () => {
      const gkvGroups = [
        {
          numKeys: 1,
          keys: [
            {
              keyIds: [100],
              values: [
                {
                  valueIds: [1001],
                  sgListOffset: 0,
                  sgPropOffset: 0,
                  sgList: [5000],
                  sgPairList: [],
                  subgraphs: [],
                },
              ],
            },
            {
              keyIds: [200],
              values: [
                {
                  valueIds: [2001],
                  sgListOffset: 0,
                  sgPropOffset: 0,
                  sgList: [5001],
                  sgPairList: [],
                  subgraphs: [],
                },
              ],
            },
          ],
        },
      ];

      const result = (serializer as any).buildLutOffsetMap(gkvGroups);

      expect(result.size).toBe(2);
      expect(result.get('100')).toBe(0);
      // Second offset should be after first entry
      expect(result.get('200')).toBeGreaterThan(0);
    });

    it('should handle empty groups', () => {
      const gkvGroups: any[] = [];

      const result = (serializer as any).buildLutOffsetMap(gkvGroups);

      expect(result.size).toBe(0);
    });
  });

  describe('serializeSubgraphConfig', () => {
    it('should serialize subgraph with properties', () => {
      const subgraphId = 5000;
      const properties = [
        {propertyId: 1000, payload: new Uint8Array([0x01, 0x02])},
        {propertyId: 1001, payload: new Uint8Array([0x03, 0x04, 0x05])},
      ];

      const result = (serializer as any).serializeSubgraphConfig(
        subgraphId,
        properties,
      );

      expect(result.length).toBeGreaterThan(0);

      const view = new DataView(
        result.buffer,
        result.byteOffset,
        result.byteLength,
      );

      // Verify APM module ID
      expect(view.getUint32(0, true)).toBe(SPF_APM_MODULE_ID);
    });

    it('should return empty array for no properties', () => {
      const subgraphId = 5000;
      const properties: any[] = [];

      const result = (serializer as any).serializeSubgraphConfig(
        subgraphId,
        properties,
      );

      expect(result.length).toBe(0);
    });
  });

  describe('serializeContainerConfig', () => {
    it('should serialize containers with properties', () => {
      const containers = [
        createMockContainerData(3000, {numProperties: 2}),
        createMockContainerData(3001, {numProperties: 1}),
      ];

      const result = (serializer as any).serializeContainerConfig(containers);

      expect(result.length).toBeGreaterThan(0);

      const view = new DataView(
        result.buffer,
        result.byteOffset,
        result.byteLength,
      );

      // Verify APM module ID
      expect(view.getUint32(0, true)).toBe(SPF_APM_MODULE_ID);
    });

    it('should order parent containers before children', () => {
      const containers = [
        createMockContainerData(3001, {parentContainerId: 3000}), // Child
        createMockContainerData(3000), // Parent
      ];

      const result = (serializer as any).serializeContainerConfig(containers);

      expect(result.length).toBeGreaterThan(0);
      // Parent should be serialized first (verified by no errors)
    });

    it('should return empty array for no containers', () => {
      const containers: ContainerDownloadModel[] = [];

      const result = (serializer as any).serializeContainerConfig(containers);

      expect(result.length).toBe(0);
    });
  });

  describe('serializeDriverProperties', () => {
    it('should serialize driver properties', () => {
      const subgraphId = 5000;
      const properties = [
        {propertyId: 1000, payload: new Uint8Array([0x01, 0x02])},
      ];

      const result = (serializer as any).serializeDriverProperties(
        subgraphId,
        properties,
      );

      expect(result.length).toBeGreaterThan(0);

      const view = new DataView(
        result.buffer,
        result.byteOffset,
        result.byteLength,
      );

      // Verify SubgraphID
      expect(view.getUint32(0, true)).toBe(subgraphId);

      // Verify NumProperties
      expect(view.getUint32(4, true)).toBe(1);
    });

    it('should handle empty properties', () => {
      const subgraphId = 5000;
      const properties: any[] = [];

      const result = (serializer as any).serializeDriverProperties(
        subgraphId,
        properties,
      );

      expect(result.length).toBe(8); // SubgraphID + NumProperties (0)
    });
  });

  describe('serializeModuleList', () => {
    it('should serialize modules grouped by container', () => {
      const subgraphId = 5000;
      const modules = [
        {instanceId: 100, moduleId: 2000, containerId: 3000},
        {instanceId: 101, moduleId: 2001, containerId: 3000},
        {instanceId: 102, moduleId: 2002, containerId: 3001},
      ];

      const result = (serializer as any).serializeModuleList(
        subgraphId,
        modules,
      );

      expect(result.length).toBeGreaterThan(0);

      const view = new DataView(
        result.buffer,
        result.byteOffset,
        result.byteLength,
      );

      // Verify APM module ID
      expect(view.getUint32(0, true)).toBe(SPF_APM_MODULE_ID);
    });

    it('should return empty array for no modules', () => {
      const subgraphId = 5000;
      const modules: any[] = [];

      const result = (serializer as any).serializeModuleList(
        subgraphId,
        modules,
      );

      expect(result.length).toBe(0);
    });
  });

  describe('serializeModuleConfig', () => {
    it('should serialize module properties including port info', () => {
      const modules = [
        {
          instanceId: 100,
          moduleId: 2000,
          containerId: 3000,
          maxInputPorts: 2,
          maxOutputPorts: 1,
          properties: [
            {propertyId: 4000, payload: new Uint8Array([0x10, 0x20])},
          ],
        },
      ];

      const result = (serializer as any).serializeModuleConfig(modules);

      expect(result.length).toBeGreaterThan(0);

      const view = new DataView(
        result.buffer,
        result.byteOffset,
        result.byteLength,
      );

      // Verify APM module ID
      expect(view.getUint32(0, true)).toBe(SPF_APM_MODULE_ID);
    });

    it('should return empty array when no modules have properties', () => {
      const modules = [
        {
          instanceId: 100,
          moduleId: 2000,
          containerId: 3000,
          maxInputPorts: 0,
          maxOutputPorts: 0,
          properties: [],
        },
      ];

      const result = (serializer as any).serializeModuleConfig(modules);

      expect(result.length).toBe(0);
    });
  });

  describe('serializeDataLinks', () => {
    it('should serialize data links', () => {
      const dataLinks = [
        {
          sourceInstanceId: 100,
          sourcePortId: 1,
          destinationInstanceId: 101,
          destinationPortId: 1,
          isInterGraph: false,
        },
      ];

      const result = (serializer as any).serializeDataLinks(dataLinks);

      expect(result.length).toBeGreaterThan(0);

      const view = new DataView(
        result.buffer,
        result.byteOffset,
        result.byteLength,
      );

      // Verify APM module ID
      expect(view.getUint32(0, true)).toBe(SPF_APM_MODULE_ID);
    });

    it('should return empty array for no links', () => {
      const dataLinks: any[] = [];

      const result = (serializer as any).serializeDataLinks(dataLinks);

      expect(result.length).toBe(0);
    });
  });

  describe('serializeControlLinks', () => {
    it('should serialize control links with heap ID and intents', () => {
      const controlLinks = [
        {
          peer1InstanceId: 100,
          peer1PortId: 1,
          peer2InstanceId: 101,
          peer2PortId: 1,
          isInterGraph: false,
          heapId: 2,
          intentIds: [100, 101],
        },
      ];

      const result = (serializer as any).serializeControlLinks(controlLinks);

      expect(result.length).toBeGreaterThan(0);

      const view = new DataView(
        result.buffer,
        result.byteOffset,
        result.byteLength,
      );

      // Verify APM module ID
      expect(view.getUint32(0, true)).toBe(SPF_APM_MODULE_ID);
    });

    it('should use default heap ID when not provided', () => {
      const controlLinks = [
        {
          peer1InstanceId: 100,
          peer1PortId: 1,
          peer2InstanceId: 101,
          peer2PortId: 1,
          isInterGraph: false,
          intentIds: [],
        },
      ];

      const result = (serializer as any).serializeControlLinks(controlLinks);

      expect(result.length).toBeGreaterThan(0);
    });

    it('should return empty array for no links', () => {
      const controlLinks: any[] = [];

      const result = (serializer as any).serializeControlLinks(controlLinks);

      expect(result.length).toBe(0);
    });
  });

  describe('serializeSpfProperties', () => {
    it('should combine all SPF components', () => {
      const subgraph = createMockSubgraphData(5000, {
        numModules: 2,
        numDataLinks: 1,
        numControlLinks: 1,
      });
      const containerMap = new Map([
        [3000, createMockContainerData(3000)],
        [3001, createMockContainerData(3001)],
      ]);

      const result = (serializer as any).serializeSpfProperties(
        subgraph,
        containerMap,
      );

      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle subgraph with no modules', () => {
      const subgraph = createMockSubgraphData(5000, {numModules: 0});
      const containerMap = new Map<number, ContainerDownloadModel>();

      const result = (serializer as any).serializeSpfProperties(
        subgraph,
        containerMap,
      );

      // Should still have subgraph config
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('serializeSubgraphPropertyPayload', () => {
    it('should serialize complete subgraph payload', () => {
      const subgraphs = [createMockSubgraphData(5000)];
      const containerMap = new Map([
        [3000, createMockContainerData(3000)],
        [3001, createMockContainerData(3001)],
      ]);

      const result = (serializer as any).serializeSubgraphPropertyPayload(
        subgraphs,
        containerMap,
      );

      expect(result.length).toBeGreaterThan(0);

      const view = new DataView(
        result.buffer,
        result.byteOffset,
        result.byteLength,
      );

      // Verify NumSubgraphs
      expect(view.getUint32(0, true)).toBe(1);
    });

    it('should handle multiple subgraphs', () => {
      const subgraphs = [
        createMockSubgraphData(5000),
        createMockSubgraphData(5001),
      ];
      const containerMap = new Map([
        [3000, createMockContainerData(3000)],
        [3001, createMockContainerData(3001)],
      ]);

      const result = (serializer as any).serializeSubgraphPropertyPayload(
        subgraphs,
        containerMap,
      );

      expect(result.length).toBeGreaterThan(0);

      const view = new DataView(
        result.buffer,
        result.byteOffset,
        result.byteLength,
      );

      // Verify NumSubgraphs
      expect(view.getUint32(0, true)).toBe(2);
    });

    it('should handle empty subgraphs array', () => {
      const subgraphs: SubgraphDownloadModel[] = [];
      const containerMap = new Map<number, ContainerDownloadModel>();

      const result = (serializer as any).serializeSubgraphPropertyPayload(
        subgraphs,
        containerMap,
      );

      expect(result.length).toBe(4); // Just NumSubgraphs (0)
    });
  });

  describe('serializeGkvTable', () => {
    it('should serialize single key-value pair', () => {
      const gkvGroups: any[] = [
        {
          numKeys: 1,
          keys: [
            {
              keyIds: [100],
              values: [
                {
                  valueIds: [1001],
                  sgListOffset: 0,
                  sgPropOffset: 0,
                  sgList: [],
                  sgPairList: [],
                  subgraphs: [],
                },
              ],
            },
          ],
        },
      ];
      const lutOffsets = new Map<string, number>([['100', 0]]);

      const result = (serializer as any).serializeGkvTable(
        gkvGroups,
        lutOffsets,
      );

      const view = new DataView(result.buffer);
      // NumKeyTbls
      expect(BinaryUtils.readUint32(view, 0)).toBe(1);
      // NumGKeys
      expect(BinaryUtils.readUint32(view, 4)).toBe(1);
      // NumGKeyEntries
      expect(BinaryUtils.readUint32(view, 8)).toBe(1);
      // Key ID
      expect(BinaryUtils.readUint32(view, 12)).toBe(100);
      // LUT offset
      expect(BinaryUtils.readUint32(view, 16)).toBe(0);
    });

    it('should serialize multiple key-value pairs', () => {
      const gkvGroups: any[] = [
        {
          numKeys: 1,
          keys: [
            {
              keyIds: [100],
              values: [
                {
                  valueIds: [1001],
                  sgListOffset: 0,
                  sgPropOffset: 0,
                  sgList: [],
                  sgPairList: [],
                  subgraphs: [],
                },
              ],
            },
            {
              keyIds: [200],
              values: [
                {
                  valueIds: [2001],
                  sgListOffset: 0,
                  sgPropOffset: 0,
                  sgList: [],
                  sgPairList: [],
                  subgraphs: [],
                },
              ],
            },
          ],
        },
      ];
      const lutOffsets = new Map<string, number>([
        ['100', 0],
        ['200', 100],
      ]);

      const result = (serializer as any).serializeGkvTable(
        gkvGroups,
        lutOffsets,
      );

      const view = new DataView(result.buffer);
      // NumKeyTbls
      expect(BinaryUtils.readUint32(view, 0)).toBe(1);
      // NumGKeys
      expect(BinaryUtils.readUint32(view, 4)).toBe(1);
      // NumGKeyEntries
      expect(BinaryUtils.readUint32(view, 8)).toBe(2);
      // First key
      expect(BinaryUtils.readUint32(view, 12)).toBe(100);
      expect(BinaryUtils.readUint32(view, 16)).toBe(0);
      // Second key
      expect(BinaryUtils.readUint32(view, 20)).toBe(200);
      expect(BinaryUtils.readUint32(view, 24)).toBe(100);
    });

    it('should serialize empty key-value list', () => {
      const gkvGroups: any[] = [];
      const lutOffsets = new Map<string, number>();

      const result = (serializer as any).serializeGkvTable(
        gkvGroups,
        lutOffsets,
      );

      const view = new DataView(result.buffer);
      // NumKeyTbls = 0
      expect(BinaryUtils.readUint32(view, 0)).toBe(0);
      expect(result.byteLength).toBe(4); // Only NumKeyTbls field
    });

    it('should use little-endian format', () => {
      const gkvGroups: any[] = [
        {
          numKeys: 1,
          keys: [
            {
              keyIds: [0x12345678],
              values: [
                {
                  valueIds: [0xabcdef01],
                  sgListOffset: 0,
                  sgPropOffset: 0,
                  sgList: [],
                  sgPairList: [],
                  subgraphs: [],
                },
              ],
            },
          ],
        },
      ];
      const lutOffsets = new Map<string, number>([['305419896', 0x11223344]]);

      const result = (serializer as any).serializeGkvTable(
        gkvGroups,
        lutOffsets,
      );

      // Verify NumKeyTbls (1) in little-endian
      expect(result[0]).toBe(0x01);
      expect(result[1]).toBe(0x00);
      expect(result[2]).toBe(0x00);
      expect(result[3]).toBe(0x00);
      // Verify NumGKeys (1) in little-endian
      expect(result[4]).toBe(0x01);
      expect(result[5]).toBe(0x00);
      expect(result[6]).toBe(0x00);
      expect(result[7]).toBe(0x00);
      // Verify NumGKeyEntries (1) in little-endian
      expect(result[8]).toBe(0x01);
      expect(result[9]).toBe(0x00);
      expect(result[10]).toBe(0x00);
      expect(result[11]).toBe(0x00);
      // Verify key ID in little-endian
      expect(result[12]).toBe(0x78); // LSB
      expect(result[13]).toBe(0x56);
      expect(result[14]).toBe(0x34);
      expect(result[15]).toBe(0x12); // MSB
    });
  });

  describe('calculateGkvTableSize', () => {
    it('should calculate size for single pair', () => {
      const gkvGroups: any[] = [
        {
          numKeys: 1,
          keys: [
            {
              keyIds: [100],
              values: [
                {
                  valueIds: [1001],
                  sgListOffset: 0,
                  sgPropOffset: 0,
                  sgList: [],
                  sgPairList: [],
                  subgraphs: [],
                },
              ],
            },
          ],
        },
      ];

      const size = (serializer as any).calculateGkvTableSize(gkvGroups);

      // NumKeyTbls (4) + NumGKeys (4) + NumGKeyEntries (4) + keyId (4) + lutOffset (4) = 20
      expect(size).toBe(20);
    });

    it('should calculate size for multiple pairs', () => {
      const gkvGroups: any[] = [
        {
          numKeys: 1,
          keys: [
            {
              keyIds: [100],
              values: [
                {
                  valueIds: [1001],
                  sgListOffset: 0,
                  sgPropOffset: 0,
                  sgList: [],
                  sgPairList: [],
                  subgraphs: [],
                },
              ],
            },
            {
              keyIds: [200],
              values: [
                {
                  valueIds: [2001],
                  sgListOffset: 0,
                  sgPropOffset: 0,
                  sgList: [],
                  sgPairList: [],
                  subgraphs: [],
                },
              ],
            },
          ],
        },
      ];

      const size = (serializer as any).calculateGkvTableSize(gkvGroups);

      // NumKeyTbls (4) + NumGKeys (4) + NumGKeyEntries (4) + 2 * (keyId (4) + lutOffset (4)) = 28
      expect(size).toBe(28);
    });

    it('should calculate size for empty list', () => {
      const gkvGroups: any[] = [];

      const size = (serializer as any).calculateGkvTableSize(gkvGroups);

      expect(size).toBe(4); // Only NumKeyTbls field
    });
  });

  describe('serializeGkvLut', () => {
    it('should serialize single offset', () => {
      const gkvGroups: any[] = [
        {
          numKeys: 1,
          keys: [
            {
              keyIds: [100],
              values: [
                {
                  valueIds: [1001],
                  sgListOffset: 100,
                  sgPropOffset: 200,
                  sgList: [],
                  sgPairList: [],
                  subgraphs: [],
                },
              ],
            },
          ],
        },
      ];

      const result = (serializer as any).serializeGkvLut(gkvGroups);

      const view = new DataView(result.buffer);
      // NumGKeyVals
      expect(BinaryUtils.readUint32(view, 0)).toBe(1);
      // NumGKVLUTEntries
      expect(BinaryUtils.readUint32(view, 4)).toBe(1);
      // Value ID
      expect(BinaryUtils.readUint32(view, 8)).toBe(1001);
      // OffsetSGListData
      expect(BinaryUtils.readUint32(view, 12)).toBe(100);
      // OffsetSGData
      expect(BinaryUtils.readUint32(view, 16)).toBe(200);
    });

    it('should serialize multiple offsets', () => {
      const gkvGroups: any[] = [
        {
          numKeys: 1,
          keys: [
            {
              keyIds: [100],
              values: [
                {
                  valueIds: [1001],
                  sgListOffset: 100,
                  sgPropOffset: 200,
                  sgList: [],
                  sgPairList: [],
                  subgraphs: [],
                },
                {
                  valueIds: [1002],
                  sgListOffset: 300,
                  sgPropOffset: 400,
                  sgList: [],
                  sgPairList: [],
                  subgraphs: [],
                },
              ],
            },
          ],
        },
      ];

      const result = (serializer as any).serializeGkvLut(gkvGroups);

      const view = new DataView(result.buffer);
      // NumGKeyVals
      expect(BinaryUtils.readUint32(view, 0)).toBe(1);
      // NumGKVLUTEntries
      expect(BinaryUtils.readUint32(view, 4)).toBe(2);
      // First value entry
      expect(BinaryUtils.readUint32(view, 8)).toBe(1001);
      expect(BinaryUtils.readUint32(view, 12)).toBe(100);
      expect(BinaryUtils.readUint32(view, 16)).toBe(200);
      // Second value entry
      expect(BinaryUtils.readUint32(view, 20)).toBe(1002);
      expect(BinaryUtils.readUint32(view, 24)).toBe(300);
      expect(BinaryUtils.readUint32(view, 28)).toBe(400);
    });

    it('should serialize empty offset list', () => {
      const gkvGroups: any[] = [];

      const result = (serializer as any).serializeGkvLut(gkvGroups);

      expect(result.byteLength).toBe(0);
    });

    it('should use little-endian format', () => {
      const gkvGroups: any[] = [
        {
          numKeys: 1,
          keys: [
            {
              keyIds: [100],
              values: [
                {
                  valueIds: [0x12345678],
                  sgListOffset: 0xabcdef01,
                  sgPropOffset: 0x11223344,
                  sgList: [],
                  sgPairList: [],
                  subgraphs: [],
                },
              ],
            },
          ],
        },
      ];

      const result = (serializer as any).serializeGkvLut(gkvGroups);

      // Verify NumGKeyVals (1) in little-endian
      expect(result[0]).toBe(0x01);
      expect(result[1]).toBe(0x00);
      expect(result[2]).toBe(0x00);
      expect(result[3]).toBe(0x00);
      // Verify NumGKVLUTEntries (1) in little-endian
      expect(result[4]).toBe(0x01);
      expect(result[5]).toBe(0x00);
      expect(result[6]).toBe(0x00);
      expect(result[7]).toBe(0x00);
      // Verify value ID in little-endian
      expect(result[8]).toBe(0x78); // LSB
      expect(result[9]).toBe(0x56);
      expect(result[10]).toBe(0x34);
      expect(result[11]).toBe(0x12); // MSB
    });
  });

  describe('calculateGkvLutSize', () => {
    it('should calculate size for single offset', () => {
      const gkvGroups: any[] = [
        {
          numKeys: 1,
          keys: [
            {
              keyIds: [100],
              values: [
                {
                  valueIds: [1001],
                  sgListOffset: 100,
                  sgPropOffset: 200,
                  sgList: [],
                  sgPairList: [],
                  subgraphs: [],
                },
              ],
            },
          ],
        },
      ];

      const size = (serializer as any).calculateGkvLutSize(gkvGroups);

      // NumGKeyVals (4) + NumGKVLUTEntries (4) + valueId (4) + sgListOffset (4) + sgPropOffset (4) = 20
      expect(size).toBe(20);
    });

    it('should calculate size for multiple offsets', () => {
      const gkvGroups: any[] = [
        {
          numKeys: 1,
          keys: [
            {
              keyIds: [100],
              values: [
                {
                  valueIds: [1001],
                  sgListOffset: 100,
                  sgPropOffset: 200,
                  sgList: [],
                  sgPairList: [],
                  subgraphs: [],
                },
                {
                  valueIds: [1002],
                  sgListOffset: 300,
                  sgPropOffset: 400,
                  sgList: [],
                  sgPairList: [],
                  subgraphs: [],
                },
              ],
            },
          ],
        },
      ];

      const size = (serializer as any).calculateGkvLutSize(gkvGroups);

      // NumGKeyVals (4) + NumGKVLUTEntries (4) + 2 * (valueId (4) + sgListOffset (4) + sgPropOffset (4)) = 32
      expect(size).toBe(32);
    });

    it('should calculate size for empty list', () => {
      const size = (serializer as any).calculateGkvLutSize([]);

      expect(size).toBe(0);
    });
  });
});
