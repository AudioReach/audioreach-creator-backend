/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {RESULT_KIND} from '../../../../../../../src/application/shared/result/result.js';
import {
  createAutoRoutingInput,
  createManualRoutingInput,
  emptyGraphEdits,
  ROUTING_MODE,
  type RoutingGraphSnapshot,
} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {RoutingContext} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';
import {
  PATH_TERMINATION,
  USECASE_CANDIDATE_KIND,
  type DfsPath,
  type KvResolutions,
  type SgkvInstance,
} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import {CombinationExpansionPhase} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/combination-expansion/combination-expansion.phase.js';
import {DATA_LINK_TYPE} from '../../../../../../../src/domain/entities/usecase-data/links/data-link-type.js';
import type {DataLink} from '../../../../../../../src/domain/entities/usecase-data/links/data-link.js';
import {UseCase} from '../../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';

const FILE_ID = 1;

function makeSubgraph(
  systemId: number,
): RoutingGraphSnapshot['subgraphs'][number] {
  return {
    subgraph: {systemId} as never,
    requestedSgkvs: [],
  };
}

function makePath(subgraphSystemIds: readonly number[]): DfsPath {
  return {
    subgraphSystemIds,
    termination: PATH_TERMINATION.NaturalLeaf,
    ecBoundaryLinkId: null,
  };
}

function ecBoundaryPath(
  subgraphSystemIds: readonly number[],
  ecBoundaryLinkId: number,
): DfsPath {
  return {
    subgraphSystemIds,
    termination: PATH_TERMINATION.EcBoundary,
    ecBoundaryLinkId,
  };
}

function ecLink(
  systemId: number,
  source: number,
  destination: number,
): DataLink {
  return {
    systemId,
    sourceSubgraphSystemId: source,
    destSubgraphSystemId: destination,
    linkType: DATA_LINK_TYPE.Ec,
  } as DataLink;
}

function makeSgkv(
  ...keyValues: readonly {keyDefSystemId: number; valueDefSystemId: number}[]
): SgkvInstance {
  return {keyValues};
}

function makeContext(
  mode: typeof ROUTING_MODE.Auto | typeof ROUTING_MODE.Manual,
  subgraphSystemIds: readonly number[],
  paths: readonly DfsPath[] = [],
  links: readonly DataLink[] = [],
  mdfSubgraphSystemIds: readonly number[] = [],
  routableControlLinks: RoutingGraphSnapshot['routableControlLinks'] = [],
  committedUsecases: readonly UseCase[] = [],
): RoutingContext {
  const init = {
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
      mdf: {
        effective: new Set(mdfSubgraphSystemIds),
        deleted: new Set(),
      },
      routableDataLinks: links,
      routableControlLinks,
      overlayDataLinks: links,
      overlayControlLinks: [],
      committedUsecases,
      sessionEdits: emptyGraphEdits(),
    },
    activeManualUsecaseEdits: [],
  } satisfies Parameters<typeof createAutoRoutingInput>[0];
  const input =
    mode === ROUTING_MODE.Auto
      ? createAutoRoutingInput(init)
      : createManualRoutingInput({
          ...init,
          manualTopology: {
            pairs: [],
            isolatedSubgraphSystemIds: subgraphSystemIds,
          },
        });
  const context = new RoutingContext(input);
  context.dfsPaths.push(...paths);
  return context;
}

function setKvResolutions(
  context: RoutingContext,
  perSg: KvResolutions['perSg'],
): void {
  context.kvResolutions = {
    perSg,
    ucFilteredBaseline: new Map(),
  };
}

describe('CombinationExpansionPhase', () => {
  const service = new CombinationExpansionPhase();

  it('T1-003 expands SGKV options and preserves canonical per-SG ownership', async () => {
    const context = makeContext(ROUTING_MODE.Auto, [1, 2], [makePath([1, 2])]);
    setKvResolutions(
      context,
      new Map([
        [
          1,
          [
            makeSgkv({keyDefSystemId: 10, valueDefSystemId: 100}),
            makeSgkv({keyDefSystemId: 10, valueDefSystemId: 101}),
          ],
        ],
        [2, [makeSgkv({keyDefSystemId: 20, valueDefSystemId: 200})]],
      ]),
    );

    const result = await service.run(context);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(context.usecaseCandidates.automaticCandidates).toHaveLength(2);
    expect(context.usecaseCandidates.automaticCandidates).toEqual([
      {
        kind: USECASE_CANDIDATE_KIND.Auto,
        path: makePath([1, 2]),
        sgkvAssignment: new Map([
          [1, makeSgkv({keyDefSystemId: 10, valueDefSystemId: 100})],
          [2, makeSgkv({keyDefSystemId: 20, valueDefSystemId: 200})],
        ]),
        gkv: [
          {keyDefSystemId: 10, valueDefSystemId: 100},
          {keyDefSystemId: 20, valueDefSystemId: 200},
        ],
        controlLinkPairs: [],
      },
      {
        kind: USECASE_CANDIDATE_KIND.Auto,
        path: makePath([1, 2]),
        sgkvAssignment: new Map([
          [1, makeSgkv({keyDefSystemId: 10, valueDefSystemId: 101})],
          [2, makeSgkv({keyDefSystemId: 20, valueDefSystemId: 200})],
        ]),
        gkv: [
          {keyDefSystemId: 10, valueDefSystemId: 101},
          {keyDefSystemId: 20, valueDefSystemId: 200},
        ],
        controlLinkPairs: [],
      },
    ]);
  });

  it('T1-002 and T2-009 return DFS-08 atomically when every assignment conflicts', async () => {
    const context = makeContext(ROUTING_MODE.Auto, [1, 2], [makePath([1, 2])]);
    setKvResolutions(
      context,
      new Map([
        [1, [makeSgkv({keyDefSystemId: 10, valueDefSystemId: 100})]],
        [2, [makeSgkv({keyDefSystemId: 10, valueDefSystemId: 101})]],
      ]),
    );

    const result = await service.run(context);

    expect(result.kind).toBe(RESULT_KIND.Fail);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.code).toBe('ARC-ROUTING-DFS-08');
    expect(result.issues[0]?.message).toContain('keyDefinitionSystemIds: [10]');
    expect(result.issues[0]?.message).toContain('key 10: subgraphs [1, 2]');
    expect(context.usecaseCandidates.automaticCandidates).toEqual([]);
  });

  it('T2-010, T2-011, and T2-012 retain only compatible branches', async () => {
    const context = makeContext(ROUTING_MODE.Auto, [1, 2], [makePath([1, 2])]);
    setKvResolutions(
      context,
      new Map([
        [
          1,
          [
            makeSgkv({keyDefSystemId: 10, valueDefSystemId: 100}),
            makeSgkv({keyDefSystemId: 10, valueDefSystemId: 101}),
          ],
        ],
        [2, [makeSgkv({keyDefSystemId: 10, valueDefSystemId: 100})]],
      ]),
    );

    await service.run(context);

    expect(context.usecaseCandidates.automaticCandidates).toHaveLength(1);
    expect(context.usecaseCandidates.automaticCandidates[0]?.gkv).toEqual([
      {keyDefSystemId: 10, valueDefSystemId: 100},
    ]);
  });

  it('FR-DFS-06/07 deduplicates identical Key/Value contributions and sorts GKV', async () => {
    const context = makeContext(ROUTING_MODE.Auto, [1, 2], [makePath([1, 2])]);
    setKvResolutions(
      context,
      new Map([
        [
          1,
          [
            makeSgkv(
              {keyDefSystemId: 20, valueDefSystemId: 200},
              {keyDefSystemId: 10, valueDefSystemId: 100},
            ),
          ],
        ],
        [
          2,
          [
            makeSgkv(
              {keyDefSystemId: 10, valueDefSystemId: 100},
              {keyDefSystemId: 20, valueDefSystemId: 200},
            ),
          ],
        ],
      ]),
    );

    await service.run(context);

    expect(context.usecaseCandidates.automaticCandidates[0]?.gkv).toEqual([
      {keyDefSystemId: 10, valueDefSystemId: 100},
      {keyDefSystemId: 20, valueDefSystemId: 200},
    ]);
  });

  it('T1-010 and T2-021 silently discard fully empty aggregate GKVs', async () => {
    const emptyContext = makeContext(
      ROUTING_MODE.Auto,
      [1, 2],
      [makePath([1, 2])],
    );
    setKvResolutions(
      emptyContext,
      new Map([
        [1, [makeSgkv()]],
        [2, [makeSgkv()]],
      ]),
    );
    await service.run(emptyContext);
    expect(emptyContext.usecaseCandidates.automaticCandidates).toEqual([]);

    const mixedContext = makeContext(
      ROUTING_MODE.Auto,
      [1, 2],
      [makePath([1, 2])],
    );
    setKvResolutions(
      mixedContext,
      new Map([
        [1, [makeSgkv({keyDefSystemId: 10, valueDefSystemId: 100})]],
        [2, [makeSgkv()]],
      ]),
    );
    await service.run(mixedContext);
    expect(mixedContext.usecaseCandidates.automaticCandidates).toHaveLength(1);
  });

  it('T-P7P8-a expands a cycle-terminated path and retains its metadata', async () => {
    const path: DfsPath = {
      subgraphSystemIds: [1, 2],
      termination: PATH_TERMINATION.Cycle,
      ecBoundaryLinkId: null,
    };
    const context = makeContext(ROUTING_MODE.Auto, [1, 2], [path]);
    setKvResolutions(
      context,
      new Map([
        [1, [makeSgkv({keyDefSystemId: 10, valueDefSystemId: 100})]],
        [2, [makeSgkv({keyDefSystemId: 20, valueDefSystemId: 200})]],
      ]),
    );

    await service.run(context);

    const candidate = context.usecaseCandidates.automaticCandidates[0]!;
    expect(candidate.kind).toBe(USECASE_CANDIDATE_KIND.Auto);
    if (candidate.kind !== USECASE_CANDIDATE_KIND.Auto)
      throw new Error('Expected an automatic candidate');
    expect(candidate.path).toBe(path);
    expect([...candidate.sgkvAssignment.keys()]).toEqual([1, 2]);
  });

  it('T1-017 and T-EC-g emits compatible Left, Bridge, and Right candidates', async () => {
    const boundary = ecBoundaryPath([1, 2], 10);
    const right = makePath([3, 4]);
    const context = makeContext(
      ROUTING_MODE.Auto,
      [1, 2, 3, 4],
      [boundary, right],
      [ecLink(10, 2, 3)],
    );
    setKvResolutions(
      context,
      new Map([
        [1, [makeSgkv({keyDefSystemId: 10, valueDefSystemId: 100})]],
        [2, [makeSgkv({keyDefSystemId: 20, valueDefSystemId: 200})]],
        [3, [makeSgkv({keyDefSystemId: 30, valueDefSystemId: 300})]],
        [4, [makeSgkv({keyDefSystemId: 40, valueDefSystemId: 400})]],
      ]),
    );

    const result = await service.run(context);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(context.usecaseCandidates.automaticCandidates).toHaveLength(2);
    expect(context.usecaseCandidates.ecBridgeCandidates).toEqual([
      expect.objectContaining({
        kind: USECASE_CANDIDATE_KIND.EcBridge,
        representativeDataLinkSystemId: 10,
        dataLinkSystemIds: [10],
        path: makePath([2, 3]),
        gkv: [
          {keyDefSystemId: 20, valueDefSystemId: 200},
          {keyDefSystemId: 30, valueDefSystemId: 300},
        ],
      }),
    ]);
  });

  it('T2-037 emits every compatible Bridge SGKV assignment', async () => {
    const context = makeContext(
      ROUTING_MODE.Auto,
      [1, 2],
      [ecBoundaryPath([1], 10), makePath([2])],
      [ecLink(10, 1, 2)],
    );
    setKvResolutions(
      context,
      new Map([
        [
          1,
          [
            makeSgkv({keyDefSystemId: 10, valueDefSystemId: 100}),
            makeSgkv({keyDefSystemId: 10, valueDefSystemId: 101}),
          ],
        ],
        [2, [makeSgkv({keyDefSystemId: 20, valueDefSystemId: 200})]],
      ]),
    );

    await service.run(context);

    expect(context.usecaseCandidates.ecBridgeCandidates).toHaveLength(2);
  });

  it('materializes an MDF-transparent Bridge with every physical member and link', async () => {
    const context = makeContext(
      ROUTING_MODE.Auto,
      [1, 2, 3, 4],
      [ecBoundaryPath([1], 10), makePath([4])],
      [ecLink(10, 1, 2), ecLink(11, 2, 3), ecLink(12, 3, 4)],
      [2, 3],
    );
    setKvResolutions(
      context,
      new Map([
        [1, [makeSgkv({keyDefSystemId: 10, valueDefSystemId: 100})]],
        [2, [makeSgkv()]],
        [3, [makeSgkv()]],
        [4, [makeSgkv({keyDefSystemId: 40, valueDefSystemId: 400})]],
      ]),
    );

    const result = await service.run(context);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(context.usecaseCandidates.ecBridgeCandidates).toEqual([
      expect.objectContaining({
        representativeDataLinkSystemId: 10,
        dataLinkSystemIds: [10, 11, 12],
        path: makePath([1, 2, 3, 4]),
        gkv: [
          {keyDefSystemId: 10, valueDefSystemId: 100},
          {keyDefSystemId: 40, valueDefSystemId: 400},
        ],
      }),
    ]);
    expect(
      context.usecaseCandidates.ecBridgeCandidates[0]?.sgkvAssignment,
    ).toEqual(
      new Map([
        [1, makeSgkv({keyDefSystemId: 10, valueDefSystemId: 100})],
        [2, makeSgkv()],
        [3, makeSgkv()],
        [4, makeSgkv({keyDefSystemId: 40, valueDefSystemId: 400})],
      ]),
    );
  });

  it('T2-038 and T-EC-h blocks atomically when the Bridge is incompatible', async () => {
    const context = makeContext(
      ROUTING_MODE.Auto,
      [1, 2, 3, 4],
      [ecBoundaryPath([1, 2], 10), makePath([3, 4])],
      [ecLink(10, 2, 3)],
    );
    setKvResolutions(
      context,
      new Map([
        [1, [makeSgkv({keyDefSystemId: 10, valueDefSystemId: 100})]],
        [2, [makeSgkv({keyDefSystemId: 20, valueDefSystemId: 200})]],
        [3, [makeSgkv({keyDefSystemId: 20, valueDefSystemId: 201})]],
        [4, [makeSgkv({keyDefSystemId: 40, valueDefSystemId: 400})]],
      ]),
    );

    const result = await service.run(context);

    expect(result.kind).toBe(RESULT_KIND.Fail);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'ARC-ROUTING-EC-BRIDGE-INCOMPATIBLE',
        severity: 'ERROR',
        impactedEntity: {entityType: 'DataLink', systemId: 10},
      }),
    ]);
    expect(result.issues[0]?.message).toContain('physical EC data links [10]');
    expect(context.usecaseCandidates.automaticCandidates).toEqual([]);
    expect(context.usecaseCandidates.ecBridgeCandidates).toEqual([]);
    expect(context.warnings).toEqual([]);
  });

  it('emits one Bridge expansion for duplicate boundary paths to the same EC', async () => {
    const context = makeContext(
      ROUTING_MODE.Auto,
      [1, 2, 3, 4],
      [ecBoundaryPath([1, 2], 10), ecBoundaryPath([4, 2], 10), makePath([3])],
      [ecLink(10, 2, 3)],
    );
    setKvResolutions(
      context,
      new Map([
        [1, [makeSgkv({keyDefSystemId: 10, valueDefSystemId: 100})]],
        [2, [makeSgkv({keyDefSystemId: 20, valueDefSystemId: 200})]],
        [3, [makeSgkv({keyDefSystemId: 30, valueDefSystemId: 300})]],
        [4, [makeSgkv({keyDefSystemId: 40, valueDefSystemId: 400})]],
      ]),
    );

    await service.run(context);

    expect(context.usecaseCandidates.ecBridgeCandidates).toHaveLength(1);
  });

  it('generates one complete physical Bridge for an ordinary MDF EC chain', async () => {
    const context = makeContext(
      ROUTING_MODE.Auto,
      [1, 2, 3],
      [ecBoundaryPath([1], 10), makePath([3])],
      [ecLink(10, 1, 2), ecLink(11, 2, 3)],
      [2],
    );
    setKvResolutions(
      context,
      new Map([
        [1, [makeSgkv({keyDefSystemId: 10, valueDefSystemId: 100})]],
        [2, [makeSgkv()]],
        [3, [makeSgkv({keyDefSystemId: 30, valueDefSystemId: 300})]],
      ]),
    );

    const result = await service.run(context);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(context.usecaseCandidates.ecBridgeCandidates).toEqual([
      expect.objectContaining({
        representativeDataLinkSystemId: 10,
        dataLinkSystemIds: [10, 11],
        path: makePath([1, 2, 3]),
      }),
    ]);
    expect(context.warnings).toEqual([]);
  });

  it('T2-046 expands ordered manual scope, including a single-SG candidate', async () => {
    const context = makeContext(ROUTING_MODE.Manual, [7]);
    setKvResolutions(
      context,
      new Map([[7, [makeSgkv({keyDefSystemId: 10, valueDefSystemId: 100})]]]),
    );

    const result = await service.run(context);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(context.usecaseCandidates.manualCandidates).toEqual([
      {
        kind: USECASE_CANDIDATE_KIND.Manual,
        memberSubgraphSystemIds: [7],
        topology: {pairs: [], isolatedSubgraphSystemIds: [7]},
        sgkvAssignment: new Map([
          [7, makeSgkv({keyDefSystemId: 10, valueDefSystemId: 100})],
        ]),
        gkv: [{keyDefSystemId: 10, valueDefSystemId: 100}],
        controlLinkPairs: [],
      },
    ]);
  });

  it('attaches a canonical control-link pair to every generated candidate', async () => {
    const context = makeContext(
      ROUTING_MODE.Auto,
      [10, 20, 30, 40],
      [makePath([10, 20, 30, 40])],
      [],
      [],
      [
        {
          systemId: 7,
          sourceSubgraphSystemId: 40,
          destSubgraphSystemId: 20,
        } as never,
      ],
    );
    setKvResolutions(
      context,
      new Map([
        [10, [makeSgkv({keyDefSystemId: 1, valueDefSystemId: 100})]],
        [20, [makeSgkv({keyDefSystemId: 2, valueDefSystemId: 200})]],
        [30, [makeSgkv({keyDefSystemId: 3, valueDefSystemId: 300})]],
        [40, [makeSgkv({keyDefSystemId: 4, valueDefSystemId: 400})]],
      ]),
    );

    const result = await service.run(context);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    for (const candidate of context.usecaseCandidates.automaticCandidates) {
      expect(candidate.controlLinkPairs).toEqual([
        {sourceSubgraphSystemId: 20, destSubgraphSystemId: 40},
      ]);
    }
  });

  it('omits a control-link pair already owned by a pre-existing UseCase', async () => {
    const context = makeContext(
      ROUTING_MODE.Auto,
      [10, 20, 30, 40],
      [makePath([10, 20, 30, 40])],
      [],
      [],
      [
        {
          systemId: 7,
          sourceSubgraphSystemId: 20,
          destSubgraphSystemId: 40,
        } as never,
      ],
      [
        new UseCase({
          systemId: 200,
          fileSystemId: FILE_ID,
          keyVector: {valueSystemIds: [99]},
          subgraphSystemIds: [20, 40],
          subgraphPairs: [
            {sourceSubgraphSystemId: 20, destSubgraphSystemId: 40},
          ],
        }),
      ],
    );
    setKvResolutions(
      context,
      new Map([
        [10, [makeSgkv({keyDefSystemId: 1, valueDefSystemId: 100})]],
        [20, [makeSgkv({keyDefSystemId: 2, valueDefSystemId: 200})]],
        [30, [makeSgkv({keyDefSystemId: 3, valueDefSystemId: 300})]],
        [40, [makeSgkv({keyDefSystemId: 4, valueDefSystemId: 400})]],
      ]),
    );

    await service.run(context);

    for (const candidate of context.usecaseCandidates.automaticCandidates) {
      expect(candidate.controlLinkPairs).toEqual([]);
    }
  });

  it('shares the immutable manual topology across every expanded GKV candidate', async () => {
    const context = makeContext(ROUTING_MODE.Manual, [7]);
    setKvResolutions(
      context,
      new Map([
        [
          7,
          [
            makeSgkv({keyDefSystemId: 10, valueDefSystemId: 100}),
            makeSgkv({keyDefSystemId: 10, valueDefSystemId: 101}),
          ],
        ],
      ]),
    );

    await service.run(context);

    if (context.input.mode !== ROUTING_MODE.Manual)
      throw new Error('Expected manual routing input');
    expect(context.usecaseCandidates.manualCandidates).toHaveLength(2);
    for (const candidate of context.usecaseCandidates.manualCandidates) {
      expect(candidate.kind).toBe(USECASE_CANDIDATE_KIND.Manual);
      if (candidate.kind !== USECASE_CANDIDATE_KIND.Manual)
        throw new Error('Expected manual UseCase candidate');
      expect(candidate.memberSubgraphSystemIds).toEqual([7]);
      expect(candidate.topology).toBe(context.input.manualTopology);
    }
  });

  it('returns the established phase-order invariant when Phase 4 output is absent', () => {
    const context = makeContext(ROUTING_MODE.Auto, [1, 2], [makePath([1, 2])]);

    expect(() => service.run(context)).toThrow(
      'CombinationExpansionPhase requires Phase 4 KV resolutions',
    );
  });

  it('T1-002 and T2-009-T2-012 publish no valid path when another path is all-conflict', async () => {
    const context = makeContext(
      ROUTING_MODE.Auto,
      [1, 2, 3, 4],
      [makePath([1, 2]), makePath([3, 4])],
    );
    setKvResolutions(
      context,
      new Map([
        [1, [makeSgkv({keyDefSystemId: 10, valueDefSystemId: 100})]],
        [2, [makeSgkv({keyDefSystemId: 20, valueDefSystemId: 200})]],
        [3, [makeSgkv({keyDefSystemId: 30, valueDefSystemId: 300})]],
        [4, [makeSgkv({keyDefSystemId: 30, valueDefSystemId: 301})]],
      ]),
    );

    const result = await service.run(context);

    expect(result.kind).toBe(RESULT_KIND.Fail);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.message).toContain('key 30: subgraphs [3, 4]');
    expect(context.usecaseCandidates.automaticCandidates).toEqual([]);
  });
});
