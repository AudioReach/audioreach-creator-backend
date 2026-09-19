/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
import {
  createAutoRoutingInput,
  createManualRoutingInput,
  emptyGraphEdits,
  ROUTING_MODE,
  type RoutingGraphSnapshot,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {RoutingContext} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';
import {
  PATH_TERMINATION,
  type DfsPath,
  type KvResolutions,
  type SgkvInstance,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import {CombinationExpansionService} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/combination-expansion.service.js';

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

function makePath(subgraphSystemIds: readonly number[]): DfsPath {
  return {
    subgraphSystemIds,
    termination: PATH_TERMINATION.NaturalLeaf,
    ecBoundaryLinkId: null,
  };
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
): RoutingContext {
  const init = {
    fileSystemId: FILE_ID,
    selectedUsecases: [],
    requestPolicy: {
      requestedSubgraphSystemIds: new Set(subgraphSystemIds),
      explicitlyExcludedSubgraphSystemIds: new Set(),
      explicitlyExcludedDataLinkSystemIds: new Set(),
      explicitlyExcludedControlLinkSystemIds: new Set(),
    },
    graphSnapshot: {
      subgraphs: subgraphSystemIds.map(makeSubgraph),
      routableDataLinks: [],
      routableControlLinks: [],
      overlayDataLinks: [],
      overlayControlLinks: [],
      committedUsecases: [],
      sessionEdits: emptyGraphEdits(),
    },
  } satisfies Parameters<typeof createAutoRoutingInput>[0];
  const input =
    mode === ROUTING_MODE.Auto
      ? createAutoRoutingInput(init)
      : createManualRoutingInput({...init, manualTopology: {pairs: []}});
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

describe('CombinationExpansionService', () => {
  const service = new CombinationExpansionService();

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
    expect(context.routingCandidates.combinations).toHaveLength(2);
    expect(context.routingCandidates.combinations).toEqual([
      {
        path: makePath([1, 2]),
        sgkvAssignment: new Map([
          [1, makeSgkv({keyDefSystemId: 10, valueDefSystemId: 100})],
          [2, makeSgkv({keyDefSystemId: 20, valueDefSystemId: 200})],
        ]),
        gkv: [
          {keyDefSystemId: 10, valueDefSystemId: 100},
          {keyDefSystemId: 20, valueDefSystemId: 200},
        ],
      },
      {
        path: makePath([1, 2]),
        sgkvAssignment: new Map([
          [1, makeSgkv({keyDefSystemId: 10, valueDefSystemId: 101})],
          [2, makeSgkv({keyDefSystemId: 20, valueDefSystemId: 200})],
        ]),
        gkv: [
          {keyDefSystemId: 10, valueDefSystemId: 101},
          {keyDefSystemId: 20, valueDefSystemId: 200},
        ],
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
    expect(context.routingCandidates.combinations).toEqual([]);
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

    expect(context.routingCandidates.combinations).toHaveLength(1);
    expect(context.routingCandidates.combinations[0]?.gkv).toEqual([
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

    expect(context.routingCandidates.combinations[0]?.gkv).toEqual([
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
    expect(emptyContext.routingCandidates.combinations).toEqual([]);

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
    expect(mixedContext.routingCandidates.combinations).toHaveLength(1);
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

    const candidate = context.routingCandidates.combinations[0]!;
    expect(candidate.path).toBe(path);
    expect([...candidate.sgkvAssignment.keys()]).toEqual([1, 2]);
  });

  it('T2-046 expands ordered manual scope, including a single-SG candidate', async () => {
    const context = makeContext(ROUTING_MODE.Manual, [7]);
    setKvResolutions(
      context,
      new Map([[7, [makeSgkv({keyDefSystemId: 10, valueDefSystemId: 100})]]]),
    );

    const result = await service.run(context);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(context.routingCandidates.combinations).toEqual([
      {
        path: makePath([7]),
        sgkvAssignment: new Map([
          [7, makeSgkv({keyDefSystemId: 10, valueDefSystemId: 100})],
        ]),
        gkv: [{keyDefSystemId: 10, valueDefSystemId: 100}],
      },
    ]);
  });

  it('returns the established phase-order invariant when Phase 4 output is absent', async () => {
    const context = makeContext(ROUTING_MODE.Auto, [1, 2], [makePath([1, 2])]);

    await expect(service.run(context)).rejects.toThrow(
      'CombinationExpansionService requires Phase 4 KV resolutions',
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
    expect(context.routingCandidates.combinations).toEqual([]);
  });
});
