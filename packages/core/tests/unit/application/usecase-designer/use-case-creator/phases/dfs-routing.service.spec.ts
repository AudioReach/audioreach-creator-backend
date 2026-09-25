/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
import {
  createAutoRoutingInput,
  emptyGraphEdits,
  ROUTING_MODE,
  type RoutingGraphSnapshot,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {DATA_LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/data-link-type.js';
import {RoutingContext} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';
import {
  PATH_TERMINATION,
  type DfsPath,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import {DfsRoutingService} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/dfs-routing.service.js';
import type {DataLink} from '../../../../../../src/domain/entities/usecase-data/links/data-link.js';

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

describe('DfsRoutingService', () => {
  const service = new DfsRoutingService();

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

  it('rejects automatic execution before Phase 6 has published cones', async () => {
    const context = makeContext([1, 2], [1], [makeDataLink(1, 1, 2)]);
    context.cones = null;

    await expect(service.run(context)).rejects.toThrow(
      'DfsRoutingService requires Phase 6 cones in automatic mode',
    );
  });

  it('T1-006 and T2-016 traverse only effective intra-usecase data links', async () => {
    const context = makeContext(
      [1, 2, 3, 4],
      [1],
      [
        makeDataLink(1, 1, 2),
        makeDataLink(2, 2, 3, DATA_LINK_TYPE.InterUsecase),
        makeDataLink(3, 3, 4, DATA_LINK_TYPE.Ec),
      ],
    );

    await service.run(context);

    expect(context.dfsPaths).toEqual([naturalLeaf([1, 2])]);
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
    context.deletionAnalysis = {
      reconstructionPaths,
    } as never;
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

  it('leaves manual mode unchanged until PR 7', async () => {
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
