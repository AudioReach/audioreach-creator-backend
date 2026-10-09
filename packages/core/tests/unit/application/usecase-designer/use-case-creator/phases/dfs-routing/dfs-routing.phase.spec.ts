/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {RESULT_KIND} from '../../../../../../../src/application/shared/result/result.js';
import {
  createAutoRoutingInput,
  emptyGraphEdits,
  ROUTING_MODE,
  type RoutingGraphSnapshot,
} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {DATA_LINK_TYPE} from '../../../../../../../src/domain/entities/usecase-data/links/data-link-type.js';
import {RoutingContext} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';
import {
  PATH_TERMINATION,
  USECASE_TOPOLOGY_DECISION_KIND,
  type DfsPath,
} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import {DfsRoutingPhase} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/dfs-routing/dfs-routing.phase.js';
import type {DataLink} from '../../../../../../../src/domain/entities/usecase-data/links/data-link.js';

const FILE_ID = 1;

function makeSubgraph(
  systemId: number,
): RoutingGraphSnapshot['subgraphs'][number] {
  return {
    subgraph: {systemId} as never,
    requestedSgkvs: [],
    isMdf: false,
  };
}

function makeDataLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
  linkType: DataLink['linkType'] = DATA_LINK_TYPE.Normal,
): DataLink {
  return {
    systemId,
    linkType,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
  } as DataLink;
}

function makeContext(
  subgraphSystemIds: readonly number[],
  roots: readonly number[],
  links: readonly DataLink[],
  mdfSubgraphSystemIds: readonly number[] = [],
): RoutingContext {
  const input = createAutoRoutingInput({
    fileSystemId: FILE_ID,
    selection: {
      selectedUsecaseSystemIds: [],
      activeSubgraphs: subgraphSystemIds.map(systemId => ({
        systemId,
        sgkvs: [],
      })),
      excludedSubgraphSystemIds: [],
      excludedDataLinkSystemIds: [],
      excludedControlLinkSystemIds: [],
    },
    selectedUsecases: [],
    graphSnapshot: {
      subgraphs: subgraphSystemIds.map(makeSubgraph),
      mdfSubgraphSystemIds: new Set(mdfSubgraphSystemIds),
      routableDataLinks: links,
      routableControlLinks: [],
      overlayDataLinks: links,
      overlayControlLinks: [],
      committedUsecases: [],
      sessionEdits: emptyGraphEdits(),
    },
    activeManualUsecaseEdits: [],
  });
  const context = new RoutingContext(input);
  context.topologyChangeAnalysis = {
    affectedUsecaseSystemIds: new Set(),
    decisions: [],
  };
  context.cones = {
    sgSystemIds: new Set(subgraphSystemIds),
    rootSgs: new Set(roots),
  };
  return context;
}

function naturalLeaf(subgraphSystemIds: readonly number[]): DfsPath {
  return {
    subgraphSystemIds,
    termination: PATH_TERMINATION.NaturalLeaf,
    ecBoundaryLinkId: null,
  };
}

describe('DfsRoutingPhase', () => {
  const service = new DfsRoutingPhase();

  it('T1-001 emits one deterministic natural-leaf path for a linear cone', async () => {
    const context = makeContext(
      [1, 2, 3],
      [1],
      [makeDataLink(1, 1, 2), makeDataLink(2, 2, 3)],
    );

    const result = await service.run(context);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(context.dfsPaths).toEqual([naturalLeaf([1, 2, 3])]);
  });

  it('T1-005 and T2-001 emit fan-out paths in root and neighbor order', async () => {
    const context = makeContext(
      [1, 2, 3, 4],
      [1],
      [
        makeDataLink(1, 1, 3),
        makeDataLink(2, 1, 2),
        makeDataLink(3, 2, 4),
        makeDataLink(4, 3, 4),
      ],
    );

    await service.run(context);

    expect(context.dfsPaths).toEqual([
      naturalLeaf([1, 2, 4]),
      naturalLeaf([1, 3, 4]),
    ]);
  });

  it('T2-001 emits multiple roots in numeric order and no one-SG path', async () => {
    const context = makeContext(
      [1, 2, 3, 4],
      [3, 1],
      [makeDataLink(1, 1, 2), makeDataLink(2, 3, 4)],
    );

    await service.run(context);

    expect(context.dfsPaths).toEqual([
      naturalLeaf([1, 2]),
      naturalLeaf([3, 4]),
    ]);
  });

  it('does not emit a one-subgraph path for an isolated root', async () => {
    const context = makeContext([1], [1], []);

    await service.run(context);

    expect(context.dfsPaths).toEqual([]);
  });

  it('throws when automatic execution lacks Phase 6 cones', () => {
    const context = makeContext([1, 2], [1], [makeDataLink(1, 1, 2)]);
    context.cones = null;

    expect(() => service.run(context)).toThrow(
      'DfsRoutingPhase requires Phase 6 cones in automatic mode',
    );
  });

  it('T1-006 and T2-016 excludes inter-usecase data links', async () => {
    const context = makeContext(
      [1, 2, 3],
      [1],
      [
        makeDataLink(1, 1, 2),
        makeDataLink(2, 2, 3, DATA_LINK_TYPE.InterUsecase),
      ],
    );

    await service.run(context);

    expect(context.dfsPaths).toEqual([naturalLeaf([1, 2])]);
  });

  it('T1-017 and T-EC-a split a linear route at an EC boundary', async () => {
    const context = makeContext(
      [1, 2, 3, 4],
      [1],
      [
        makeDataLink(1, 1, 2),
        makeDataLink(2, 2, 3, DATA_LINK_TYPE.Ec),
        makeDataLink(3, 3, 4),
      ],
    );

    const result = await service.run(context);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(context.dfsPaths).toEqual([
      {
        subgraphSystemIds: [1, 2],
        termination: PATH_TERMINATION.EcBoundary,
        ecBoundaryLinkId: 2,
      },
      naturalLeaf([3, 4]),
    ]);
  });

  it('emits valid one-subgraph Left and Right paths when EC connects two leaves', async () => {
    const context = makeContext(
      [1, 2],
      [1],
      [makeDataLink(10, 1, 2, DATA_LINK_TYPE.Ec)],
    );

    await service.run(context);

    expect(context.dfsPaths).toEqual([
      {
        subgraphSystemIds: [1],
        termination: PATH_TERMINATION.EcBoundary,
        ecBoundaryLinkId: 10,
      },
      naturalLeaf([2]),
    ]);
  });

  it('T2-045 keeps a regular branch while splitting the EC branch', async () => {
    const context = makeContext(
      [1, 2, 3, 4],
      [1],
      [
        makeDataLink(1, 1, 2),
        makeDataLink(2, 2, 3, DATA_LINK_TYPE.Ec),
        makeDataLink(3, 2, 4),
      ],
    );

    await service.run(context);

    expect(context.dfsPaths).toEqual([
      naturalLeaf([1, 2, 4]),
      {
        subgraphSystemIds: [1, 2],
        termination: PATH_TERMINATION.EcBoundary,
        ecBoundaryLinkId: 2,
      },
      naturalLeaf([3]),
    ]);
  });

  it('T-EC-e emits every right-side leaf', async () => {
    const context = makeContext(
      [1, 2, 3, 4],
      [1],
      [
        makeDataLink(10, 1, 2, DATA_LINK_TYPE.Ec),
        makeDataLink(11, 2, 3),
        makeDataLink(12, 2, 4),
      ],
    );

    await service.run(context);

    expect(context.dfsPaths).toEqual([
      {
        subgraphSystemIds: [1],
        termination: PATH_TERMINATION.EcBoundary,
        ecBoundaryLinkId: 10,
      },
      naturalLeaf([2, 3]),
      naturalLeaf([2, 4]),
    ]);
  });

  it('T-EC-d reports a cycle reached from the right side of an EC boundary', async () => {
    const context = makeContext(
      [1, 2, 3],
      [1],
      [
        makeDataLink(10, 1, 2, DATA_LINK_TYPE.Ec),
        makeDataLink(11, 2, 3),
        makeDataLink(12, 3, 2),
      ],
    );

    const result = await service.run(context);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(context.dfsPaths).toEqual([
      {
        subgraphSystemIds: [1],
        termination: PATH_TERMINATION.EcBoundary,
        ecBoundaryLinkId: 10,
      },
      {
        subgraphSystemIds: [2, 3],
        termination: PATH_TERMINATION.Cycle,
        ecBoundaryLinkId: null,
      },
    ]);
    expect(context.warnings).toEqual([
      expect.objectContaining({
        code: 'ARC-ROUTING-CYCLE-DETECTED',
        impactedEntity: {entityType: 'Subgraph', systemId: 2},
      }),
    ]);
  });

  it('T-EC-f runs one right traversal when multiple left paths reach the same EC', async () => {
    const context = makeContext(
      [1, 2, 3, 4, 5, 6],
      [1],
      [
        makeDataLink(1, 1, 2),
        makeDataLink(2, 1, 3),
        makeDataLink(3, 2, 4),
        makeDataLink(4, 3, 4),
        makeDataLink(10, 4, 5, DATA_LINK_TYPE.Ec),
        makeDataLink(11, 5, 6),
      ],
    );

    await service.run(context);

    expect(context.dfsPaths).toEqual([
      {
        subgraphSystemIds: [1, 2, 4],
        termination: PATH_TERMINATION.EcBoundary,
        ecBoundaryLinkId: 10,
      },
      naturalLeaf([5, 6]),
      {
        subgraphSystemIds: [1, 3, 4],
        termination: PATH_TERMINATION.EcBoundary,
        ecBoundaryLinkId: 10,
      },
    ]);
  });

  it('T2-039 blocks two logical EC connections on one path without publishing paths', async () => {
    const context = makeContext(
      [1, 2, 3, 4],
      [1],
      [
        makeDataLink(10, 1, 2, DATA_LINK_TYPE.Ec),
        makeDataLink(11, 2, 3),
        makeDataLink(12, 3, 4, DATA_LINK_TYPE.Ec),
      ],
    );

    const result = await service.run(context);

    expect(result).toEqual(
      expect.objectContaining({
        kind: RESULT_KIND.Fail,
        issues: [
          expect.objectContaining({
            code: 'ARC-ROUTING-EC-05',
            message: expect.stringContaining('first EC data link 10'),
          }),
        ],
      }),
    );
    expect(context.dfsPaths).toEqual([]);
  });

  it('treats an MDF-transparent physical EC chain as one logical boundary', async () => {
    const context = makeContext(
      [1, 2, 3, 4],
      [1],
      [
        makeDataLink(10, 1, 2, DATA_LINK_TYPE.Ec),
        makeDataLink(11, 2, 3, DATA_LINK_TYPE.Ec),
        makeDataLink(12, 3, 4),
      ],
      [2],
    );

    const result = await service.run(context);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(context.dfsPaths).toEqual([
      {
        subgraphSystemIds: [1],
        termination: PATH_TERMINATION.EcBoundary,
        ecBoundaryLinkId: 10,
      },
      naturalLeaf([3, 4]),
    ]);
  });

  it('T1-004, T2-014, and T2-015 emit cycle paths and continue sibling traversal', async () => {
    const context = makeContext(
      [1, 2, 3, 4],
      [1],
      [
        makeDataLink(1, 1, 2),
        makeDataLink(2, 2, 3),
        makeDataLink(3, 3, 1),
        makeDataLink(4, 1, 4),
      ],
    );

    await service.run(context);

    expect(context.dfsPaths).toEqual([
      {
        subgraphSystemIds: [1, 2, 3],
        termination: PATH_TERMINATION.Cycle,
        ecBoundaryLinkId: null,
      },
      naturalLeaf([1, 4]),
    ]);
    expect(context.warnings).toEqual([
      expect.objectContaining({
        code: 'ARC-ROUTING-CYCLE-DETECTED',
        impactedEntity: {entityType: 'Subgraph', systemId: 1},
      }),
    ]);
  });

  it('T-P7-c emits a deterministic path for a pure rootless cycle', async () => {
    const context = makeContext(
      [8, 9, 10],
      [],
      [makeDataLink(1, 8, 9), makeDataLink(2, 9, 10), makeDataLink(3, 10, 8)],
    );

    await service.run(context);

    expect(context.dfsPaths).toEqual([
      {
        subgraphSystemIds: [8, 9, 10],
        termination: PATH_TERMINATION.Cycle,
        ecBoundaryLinkId: null,
      },
    ]);
    expect(context.warnings).toEqual([
      expect.objectContaining({
        code: 'ARC-ROUTING-CYCLE-DETECTED',
        impactedEntity: {entityType: 'Subgraph', systemId: 8},
      }),
    ]);
  });

  it('emits a complete deterministic deep-chain path', async () => {
    const ids = Array.from({length: 12}, (_, index) => index + 1);
    const links = ids
      .slice(0, -1)
      .map((id, index) => makeDataLink(index + 1, id, ids[index + 1]!));
    const context = makeContext(ids, [1], links);

    await service.run(context);

    expect(context.dfsPaths).toEqual([naturalLeaf(ids)]);
  });

  it('T2-018 merges copied reconstruction paths after main paths without deduplication', async () => {
    const context = makeContext([1, 2], [1], [makeDataLink(1, 1, 2)]);
    const reconstructionPaths = [
      {originalUsecaseSystemId: 20, path: naturalLeaf([5, 6])},
      {originalUsecaseSystemId: 10, path: naturalLeaf([3, 5])},
      {originalUsecaseSystemId: 1, path: naturalLeaf([1, 2])},
      {originalUsecaseSystemId: 10, path: naturalLeaf([3, 4])},
    ];
    context.topologyChangeAnalysis = {
      affectedUsecaseSystemIds: new Set([1]),
      decisions: [
        {
          kind: USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
          usecase: {systemId: 1} as never,
          deletedComponent: {type: 'DATA_LINK', systemId: 1},
          reconstructionPaths: reconstructionPaths.map(item => item.path),
        },
      ],
    };
    const original = structuredClone(reconstructionPaths);

    await service.run(context);

    expect(context.dfsPaths).toEqual([
      naturalLeaf([1, 2]),
      naturalLeaf([1, 2]),
      naturalLeaf([3, 4]),
      naturalLeaf([3, 5]),
      naturalLeaf([5, 6]),
    ]);
    expect(reconstructionPaths).toEqual(original);
  });

  it('leaves manual-mode DFS paths unchanged', async () => {
    const context = makeContext([1, 2], [1], [makeDataLink(1, 1, 2)]);
    const manualInput = {
      ...context.input,
      mode: ROUTING_MODE.Manual,
      manualTopology: {pairs: []},
    } as never;
    const manualContext = new RoutingContext(manualInput);
    manualContext.dfsPaths.push(naturalLeaf([9, 10]));

    await service.run(manualContext);

    expect(manualContext.dfsPaths).toEqual([naturalLeaf([9, 10])]);
  });
});
