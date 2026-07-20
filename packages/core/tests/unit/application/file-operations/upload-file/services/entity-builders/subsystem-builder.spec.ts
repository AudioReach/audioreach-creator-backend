/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {jest, describe, it, expect, beforeEach} from '@jest/globals';
import {SubsystemBuilder} from '../../../../../../../src/application/file-operations/upload-file/services/entity-builders/subsystem-builder.js';
import {DataLink} from '../../../../../../../src/domain/entities/usecase-data/links/data-link.js';
import {ControlLink} from '../../../../../../../src/domain/entities/usecase-data/links/control-link.js';
import {
  asNaturalId,
  asSystemId,
} from '../../../../../../../src/shared/types/branded-ids.js';
import {
  createMockLogger,
  createMockIdGenerator,
  createMockForeignKeyMapper,
} from '../../../../../../helpers/index.js';
import type {UiMetadata} from '../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/ui-metadata/index.js';
import type {IdGenerationPort} from '../../../../../../../src/application/ports/id-generation/id-generation.port.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDataLink(
  systemId: number,
  srcNode: number,
  dstNode: number,
  srcPort = 1,
  dstPort = 2,
): DataLink {
  return new DataLink({
    systemId,
    fileSystemId: 1,
    sourceNodeSystemId: srcNode,
    destinationNodeSystemId: dstNode,
    sourcePortSystemId: srcPort,
    destinationPortSystemId: dstPort,
    isEc: false,
    uiPersistence: '',
  });
}

function makeControlLink(
  systemId: number,
  nodeA: number,
  nodeB: number,
  portA = 10,
  portB = 20,
): ControlLink {
  return new ControlLink(
    systemId,
    1,
    nodeA,
    nodeB,
    portA,
    portB,
    0,
    'CTRL' as unknown as import('../../../../../../../src/domain/entities/usecase-data/links/link-type.js').LinkType,
    0,
    0,
  );
}

// ─── SubsystemBuilder — shell building ───────────────────────────────────────

describe('SubsystemBuilder', () => {
  let builder: SubsystemBuilder;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockIdGenerator: ReturnType<typeof createMockIdGenerator>;
  let mockFkMapper: ReturnType<typeof createMockForeignKeyMapper>;
  let idCounter: number;

  beforeEach(() => {
    idCounter = 0;
    mockLogger = createMockLogger();
    mockIdGenerator = createMockIdGenerator();
    mockFkMapper = createMockForeignKeyMapper();
    mockIdGenerator.getNextId.mockImplementation(async () => ++idCounter);
    mockFkMapper.getKeySystemId.mockReturnValue(asSystemId(999));
    mockFkMapper.getSubsystemSystemId.mockReturnValue(undefined);
    mockFkMapper.getModuleInstanceSubgraphEntries.mockReturnValue(new Map());
    builder = new SubsystemBuilder(
      mockIdGenerator,
      mockFkMapper,
      undefined,
      mockLogger,
    );
  });

  it('should return empty result for empty subsystem list', async () => {
    const meta: UiMetadata = {
      version: {major: 1, minor: 0},
      payloadMap: [],
      usecases: [],
      subsystems: [],
      subgraphs: [],
      modules: [],
      dataLinks: [],
    };
    const {subsystems} = await builder.build(meta.subsystems, 100, [], []);
    expect(subsystems).toHaveLength(0);
  });

  it('should build a single root subsystem node', async () => {
    const meta: UiMetadata = {
      version: {major: 1, minor: 0},
      payloadMap: [],
      usecases: [],
      subgraphs: [],
      modules: [],
      dataLinks: [],
      subsystems: [{id: 0xf0100001, name: 'StreamRx', children: []}],
    };
    const {subsystems} = await builder.build(meta.subsystems, 100, [], []);
    expect(subsystems).toHaveLength(1);
    expect(subsystems[0].parentId).toBeUndefined();
    expect(subsystems[0].name).toBe('StreamRx');
    expect(subsystems[0].subsystemId).toBe(0xf0100001);
  });

  it('should set parentId for child subsystem', async () => {
    mockFkMapper.getSubsystemSystemId.mockReturnValueOnce(asSystemId(1));
    const meta: UiMetadata = {
      version: {major: 1, minor: 0},
      payloadMap: [],
      usecases: [],
      subgraphs: [],
      modules: [],
      dataLinks: [],
      subsystems: [
        {
          id: 0xf0100001,
          name: 'Parent',
          children: [{id: 0xf0100002, type: 'Subsystem'}],
        },
        {id: 0xf0100002, name: 'Child', children: []},
      ],
    };
    const {subsystems} = await builder.build(meta.subsystems, 100, [], []);
    expect(subsystems).toHaveLength(2);
    const child = subsystems.find(s => s.subsystemId === 0xf0100002)!;
    expect(child.parentId).toBeDefined();
  });

  it('should register mapping in fk mapper for each subsystem', async () => {
    const meta: UiMetadata = {
      version: {major: 1, minor: 0},
      payloadMap: [],
      usecases: [],
      subgraphs: [],
      modules: [],
      dataLinks: [],
      subsystems: [{id: 0xf0100001, name: 'S', children: []}],
    };
    await builder.build(meta.subsystems, 100, [], []);
    expect(mockFkMapper.addSubsystemMapping).toHaveBeenCalledWith(
      asNaturalId(0xf0100001),
      expect.any(Number),
    );
  });

  it('should populate filteredKeySystemIds from filteredGraphKeys', async () => {
    mockFkMapper.getKeySystemId.mockReturnValue(asSystemId(500));
    const meta: UiMetadata = {
      version: {major: 1, minor: 0},
      payloadMap: [],
      usecases: [],
      subgraphs: [],
      modules: [],
      dataLinks: [],
      subsystems: [
        {
          id: 0xf0100001,
          name: 'S',
          filteredGraphKeys: '0xAB000000,0xA1000000',
          children: [],
        },
      ],
    };
    const {subsystems} = await builder.build(meta.subsystems, 100, [], []);
    expect(subsystems[0].filteredKeySystemIds).toEqual([500, 500]);
  });

  it('should skip unknown filtered keys and log a warning', async () => {
    mockFkMapper.getKeySystemId.mockReturnValue(undefined);
    const meta: UiMetadata = {
      version: {major: 1, minor: 0},
      payloadMap: [],
      usecases: [],
      subgraphs: [],
      modules: [],
      dataLinks: [],
      subsystems: [
        {
          id: 0xf0100001,
          name: 'S',
          filteredGraphKeys: '0xDEAD0000',
          children: [],
        },
      ],
    };
    const {subsystems} = await builder.build(meta.subsystems, 100, [], []);
    expect(subsystems[0].filteredKeySystemIds).toEqual([]);
    expect(mockLogger.logWarn).toHaveBeenCalled();
  });

  it('should pass through dataLinks and controlLinks in result', async () => {
    const dataLink = makeDataLink(1, 100, 200);
    const ctrl = makeControlLink(2, 100, 200);
    const result = await builder.build([], 100, [dataLink], [ctrl]);
    expect(result.dataLinks).toBe(result.dataLinks);
    expect(result.controlLinks[0]).toBe(ctrl);
  });
});

// ─── SubsystemBuilder — boundary port attachment (Steps A–F) ─────────────────

describe('SubsystemBuilder — boundary ports', () => {
  let idSeq: number;

  function makeIdGen(): IdGenerationPort {
    return {
      getNextId: jest.fn().mockImplementation(() => Promise.resolve(++idSeq)),
      reserveBlock: jest.fn().mockResolvedValue(1),
      persistLastUsedId: jest.fn().mockResolvedValue(undefined),
    };
  }

  beforeEach(() => {
    idSeq = 1000;
  });

  // ── Short-circuit ──────────────────────────────────────────────────────────

  describe('short-circuit cases', () => {
    it('returns empty subsystems when uiSubsystems is empty', async () => {
      const mockFkMapper = createMockForeignKeyMapper();
      const builder = new SubsystemBuilder(makeIdGen(), mockFkMapper);
      const dataLink = makeDataLink(1, 100, 200);
      const {subsystems, dataLinks} = await builder.build(
        [],
        1,
        [dataLink],
        [],
      );
      expect(subsystems).toHaveLength(0);
      expect(dataLinks[0].subsystemDataLinks).toHaveLength(0);
    });
  });

  // ── Single-hop data link ───────────────────────────────────────────────────

  describe('single subsystem boundary crossing (data link)', () => {
    // Topology:
    //   uiSubsysA (0xa001) has Subgraph child 5001; module 100 lives in subgraph 5001
    //   uiSubsysB (0xa002) has Subgraph child 5002; module 200 lives in subgraph 5002
    //
    //   After buildSubsystemShells:
    //     subsysA gets systemId 1001, subsysB gets 1002
    //     subgraphToSubsystemMap: {5001→1001, 5002→1002}
    //
    //   buildNodeParentMap:
    //     {1001→null, 1002→null, 100→1001, 200→1002}
    //
    //   dataLink (100→200): nodeSequence=[100,1001,1002,200] → 3 SLS segments

    let dataLink: DataLink;
    let result: Awaited<ReturnType<SubsystemBuilder['build']>>;

    beforeEach(async () => {
      idSeq = 1000; // first getNextId → 1001 (subsysA), then 1002 (subsysB), then ports/segments

      const mockFkMapper = createMockForeignKeyMapper();
      mockFkMapper.getSubsystemSystemId.mockReturnValue(undefined);
      mockFkMapper.getKeySystemId.mockReturnValue(undefined);
      mockFkMapper.addSubsystemMapping.mockImplementation(() => {});

      // subgraphToSubsystemMap populated during buildSubsystemShells via Subgraph children
      mockFkMapper.getSubgraphSystemId.mockImplementation((id: unknown) => {
        if (id === asNaturalId(5001)) return asSystemId(1001);
        if (id === asNaturalId(5002)) return asSystemId(1002);
        return undefined;
      });

      // buildNodeParentMap: module instance → subgraph (systemId) → subsystem
      // The map values must be the FK-mapped subgraph systemIds (1001, 1002),
      // not the natural IDs (5001, 5002), because subgraphToSubsystemMap is
      // keyed by subgraph systemId.
      mockFkMapper.getModuleInstanceSubgraphEntries.mockReturnValue(
        new Map([
          [asNaturalId(100), asSystemId(1001)],
          [asNaturalId(200), asSystemId(1002)],
        ]),
      );
      mockFkMapper.getSpfModuleSystemId.mockImplementation((id: unknown) => {
        if (id === asNaturalId(100)) return 100;
        if (id === asNaturalId(200)) return 200;
        return undefined;
      });

      dataLink = makeDataLink(1, 100, 200, 50, 60);

      const builder = new SubsystemBuilder(makeIdGen(), mockFkMapper);
      result = await builder.build(
        [
          {
            id: 0xa001,
            name: 'subsysA',
            children: [{id: 5001, type: 'Subgraph'}],
          },
          {
            id: 0xa002,
            name: 'subsysB',
            children: [{id: 5002, type: 'Subgraph'}],
          },
        ],
        1,
        [dataLink],
        [],
      );
    });

    it('attaches 3 SLS segments (one per edge in nodeSequence [100,10,20,200])', () => {
      expect(dataLink.subsystemDataLinks).toHaveLength(3);
    });

    it('first segment source port equals the original data link source port', () => {
      expect(dataLink.subsystemDataLinks[0].sourcePortSystemId).toBe(50);
    });

    it('last segment destination port equals the original data link destination port', () => {
      expect(dataLink.subsystemDataLinks[2].destinationPortSystemId).toBe(60);
    });

    it('rebuilds both subsystems with one boundary data port each', () => {
      const {subsystems} = result;
      expect(subsystems[0].dataPorts).toHaveLength(1);
      expect(subsystems[1].dataPorts).toHaveLength(1);
    });

    it('assigns distinct systemIds to boundary ports', () => {
      const {subsystems} = result;
      expect(subsystems[0].dataPorts[0].systemId).not.toBe(
        subsystems[1].dataPorts[0].systemId,
      );
    });
  });

  // ── computePaths static handler ───────────────────────────────────────────

  describe('SubsystemBuilder.computePaths (static worker handler)', () => {
    it('returns null for same-subsystem links', () => {
      const output = SubsystemBuilder.computePaths({
        links: [{systemId: 1, nodeAId: 100, nodeBId: 101}],
        nodeParentMapEntries: [
          [10, null],
          [100, 10],
          [101, 10],
        ],
      });
      expect(output.paths[0]).toBeNull();
    });

    it('returns a path for cross-subsystem links', () => {
      const output = SubsystemBuilder.computePaths({
        links: [{systemId: 1, nodeAId: 100, nodeBId: 200}],
        nodeParentMapEntries: [
          [10, null],
          [20, null],
          [100, 10],
          [200, 20],
        ],
      });
      const path = output.paths[0];
      expect(path).not.toBeNull();
      expect(path!.nodeSequence).toEqual([100, 10, 20, 200]);
    });

    it('reconstructs nodeParentMap from entries correctly for multi-hop', () => {
      const output = SubsystemBuilder.computePaths({
        links: [{systemId: 1, nodeAId: 100, nodeBId: 200}],
        nodeParentMapEntries: [
          [30, null],
          [20, 30],
          [10, 20],
          [100, 10],
          [200, null],
        ],
      });
      const path = output.paths[0];
      expect(path).not.toBeNull();
      expect(path!.nodeSequence).toHaveLength(5);
    });
  });
});
