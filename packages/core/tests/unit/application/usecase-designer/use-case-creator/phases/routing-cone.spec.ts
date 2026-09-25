/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {UseCase} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import type {ControlLink} from '../../../../../../src/domain/entities/usecase-data/links/control-link.js';
import type {DataLink} from '../../../../../../src/domain/entities/usecase-data/links/data-link.js';
import {DATA_LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/data-link-type.js';
import {Subgraph} from '../../../../../../src/domain/entities/usecase-data/subgraph/subgraph.js';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
import type {SubgraphRepository} from '../../../../../../src/application/ports/persistence/repositories/subgraph/subgraph.repository.js';
import {
  createAutoRoutingInput,
  emptyGraphEdits,
  type GraphEditSummary,
  type RoutingGraphSnapshot,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {RoutingContext} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';
import {ConeComputationService} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/cone-computation.service.js';
import {KvResolutionService} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/kv-resolution.service.js';
import {SeedDetectionService} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/seed-detection.service.js';

const FILE_ID = 1;

interface RepositoryOptions {
  readonly baseline: readonly {
    sgSystemId: number;
    sgkvSystemId: number;
    keyValues: readonly {
      keyDefSystemId: number;
      valueDefSystemId: number;
    }[];
  }[];
  readonly resolved: readonly {
    keyDefSystemId: number;
    valueDefSystemId: number;
  }[];
}

interface ContextOptions {
  readonly subgraphSystemIds: readonly number[];
  readonly requestedSgkvs?: Readonly<
    Record<number, readonly (readonly number[])[]>
  >;
  readonly selectedUsecases?: readonly UseCase[];
  readonly committedUsecases?: readonly UseCase[];
  readonly dataLinks?: readonly DataLink[];
  readonly controlLinks?: readonly ControlLink[];
  readonly sessionEdits?: GraphEditSummary;
  readonly excludedSubgraphSystemIds?: readonly number[];
  readonly isMdf?: ReadonlySet<number>;
}

function makeSubgraph(
  systemId: number,
  requestedSgkvs: readonly (readonly number[])[],
  isMdf: boolean,
): RoutingGraphSnapshot['subgraphs'][number] {
  return {
    subgraph: new Subgraph({
      systemId,
      subgraphId: systemId + 1000,
      name: `sg-${systemId}`,
      isImported: false,
      fileSystemId: FILE_ID,
    }),
    requestedSgkvs,
    isMdf,
  };
}

function makeUsecase(
  systemId: number,
  subgraphSystemIds: readonly number[],
  valueSystemIds: readonly number[],
): UseCase {
  return new UseCase({
    systemId,
    fileSystemId: FILE_ID,
    keyVector: {valueSystemIds: [...valueSystemIds]},
    subgraphSystemIds: [...subgraphSystemIds],
    subgraphPairs: [],
  });
}

function makeDataLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): DataLink {
  return {
    systemId,
    linkType: DATA_LINK_TYPE.Normal,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
  } as DataLink;
}

function makeControlLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): ControlLink {
  return {
    systemId,
    linkType: DATA_LINK_TYPE.Normal,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
  } as ControlLink;
}

function makeContext(options: ContextOptions): RoutingContext {
  const requestedSgkvs = options.requestedSgkvs ?? {};
  const selectedUsecases = options.selectedUsecases ?? [];
  const subgraphs = options.subgraphSystemIds.map(systemId =>
    makeSubgraph(
      systemId,
      requestedSgkvs[systemId] ?? [],
      options.isMdf?.has(systemId) ?? false,
    ),
  );
  const dataLinks = options.dataLinks ?? [];
  const controlLinks = options.controlLinks ?? [];
  const graphSnapshot: RoutingGraphSnapshot = {
    subgraphs,
    routableDataLinks: dataLinks,
    routableControlLinks: controlLinks,
    overlayDataLinks: dataLinks,
    overlayControlLinks: controlLinks,
    committedUsecases: options.committedUsecases ?? selectedUsecases,
    sessionEdits: options.sessionEdits ?? emptyGraphEdits(),
  };

  return new RoutingContext(
    createAutoRoutingInput({
      fileSystemId: FILE_ID,
      selection: {
        selectedUsecaseSystemIds: selectedUsecases.map(
          usecase => usecase.systemId,
        ),
        activeSubgraphs: subgraphs.map(entry => ({
          systemId: entry.subgraph.systemId,
          sgkvs: entry.requestedSgkvs,
        })),
        excludedSubgraphSystemIds: options.excludedSubgraphSystemIds ?? [],
        excludedDataLinkSystemIds: [],
        excludedControlLinkSystemIds: [],
      },
      selectedUsecases,
      graphSnapshot,
      activeManualUsecaseEdits: [],
    }),
  );
}

function makeRepository(options: RepositoryOptions): {
  readonly repository: SubgraphRepository;
  readonly getSgkvs: jest.Mock;
  readonly resolveKeyValues: jest.Mock;
} {
  const getSgkvs = jest.fn().mockResolvedValue(options.baseline);
  const resolveKeyValues = jest.fn().mockResolvedValue(options.resolved);
  return {
    repository: {getSgkvs, resolveKeyValues} as unknown as SubgraphRepository,
    getSgkvs,
    resolveKeyValues,
  };
}

async function runPhaseChain(
  context: RoutingContext,
  repository: SubgraphRepository,
) {
  const phase4 = await new KvResolutionService().run(context, repository);
  if (phase4.kind === RESULT_KIND.Fail)
    return {phase4, phase5: null, phase6: null};

  const phase5 = await new SeedDetectionService().run(context);
  if (phase5.kind === RESULT_KIND.Fail) return {phase4, phase5, phase6: null};

  const phase6 = await new ConeComputationService().run(context);
  return {phase4, phase5, phase6};
}

function expectSuccessfulChain(
  results: Awaited<ReturnType<typeof runPhaseChain>>,
): void {
  expect(results.phase4.kind).toBe(RESULT_KIND.Ok);
  expect(results.phase5?.kind).toBe(RESULT_KIND.Ok);
  expect(results.phase6?.kind).toBe(RESULT_KIND.Ok);
}

describe('Routing cone pipeline', () => {
  it('propagates content-only output through all phases without mutating the snapshot', async () => {
    const selected = makeUsecase(100, [10, 20], [101]);
    const context = makeContext({
      subgraphSystemIds: [10, 20, 30],
      requestedSgkvs: {10: [[102]], 20: [], 30: []},
      selectedUsecases: [selected],
      committedUsecases: [selected],
      dataLinks: [makeDataLink(1, 10, 20), makeDataLink(2, 20, 30)],
    });
    const snapshotBefore = JSON.stringify(context.input.graphSnapshot);
    const repository = makeRepository({
      baseline: [
        {
          sgSystemId: 10,
          sgkvSystemId: 700,
          keyValues: [{keyDefSystemId: 501, valueDefSystemId: 101}],
        },
      ],
      resolved: [
        {keyDefSystemId: 501, valueDefSystemId: 101},
        {keyDefSystemId: 502, valueDefSystemId: 102},
      ],
    });

    const results = await runPhaseChain(context, repository.repository);

    expectSuccessfulChain(results);
    expect(repository.getSgkvs).toHaveBeenCalledTimes(1);
    expect(repository.resolveKeyValues).toHaveBeenCalledTimes(1);
    expect(context.kvResolutions?.perSg.get(10)).toEqual([
      {keyValues: [{keyDefSystemId: 502, valueDefSystemId: 102}]},
    ]);
    expect(context.kvResolutions).not.toEqual(
      expect.objectContaining({sgkvSystemId: expect.anything()}),
    );
    expect(context.seeds?.sgSystemIds).toEqual(new Set([10, 20, 30]));
    expect(context.cones).toEqual({
      sgSystemIds: new Set([10, 20, 30]),
      rootSgs: new Set([10]),
    });
    expect(JSON.stringify(context.input.graphSnapshot)).toBe(snapshotBefore);
  });

  it('uses an empty baseline for empty selected UCs and normalizes empty API SGKV lists', async () => {
    const context = makeContext({
      subgraphSystemIds: [10, 20],
      requestedSgkvs: {10: [], 20: []},
      isMdf: new Set([10]),
      dataLinks: [makeDataLink(1, 10, 20)],
    });
    const repository = makeRepository({
      baseline: [
        {
          sgSystemId: 10,
          sgkvSystemId: 700,
          keyValues: [{keyDefSystemId: 501, valueDefSystemId: 101}],
        },
      ],
      resolved: [],
    });

    const results = await runPhaseChain(context, repository.repository);

    expectSuccessfulChain(results);
    expect(context.kvResolutions?.ucFilteredBaseline.get(10)).toEqual([]);
    expect(context.kvResolutions?.perSg.get(10)).toEqual([{keyValues: []}]);
    expect(context.seeds).toEqual({
      sgSystemIds: new Set([10, 20]),
      reasons: new Map([
        [10, 'NO_USECASE_CONTEXT'],
        [20, 'NO_USECASE_CONTEXT'],
      ]),
    });
    expect(context.cones).toEqual({
      sgSystemIds: new Set([10, 20]),
      rootSgs: new Set([10]),
    });
  });

  it('accepts a same-file Value absent from persisted SGKVs and excludes deleted-scope neighbors', async () => {
    const selected = makeUsecase(100, [10], [202]);
    const context = makeContext({
      subgraphSystemIds: [10, 20],
      requestedSgkvs: {10: [[202]], 20: [[202]]},
      selectedUsecases: [selected],
      committedUsecases: [selected],
      dataLinks: [makeDataLink(1, 10, 20), makeDataLink(2, 10, 30)],
      excludedSubgraphSystemIds: [30],
      sessionEdits: {
        ...emptyGraphEdits(),
        deletedSgs: [
          new Subgraph({
            systemId: 30,
            subgraphId: 1030,
            name: 'sg-30',
            isImported: false,
            fileSystemId: FILE_ID,
          }),
        ],
        deletedDataLinks: [makeDataLink(2, 10, 30)],
      },
    });
    const repository = makeRepository({
      baseline: [],
      resolved: [{keyDefSystemId: 601, valueDefSystemId: 202}],
    });

    const results = await runPhaseChain(context, repository.repository);

    expectSuccessfulChain(results);
    expect(context.kvResolutions?.perSg.get(10)).toEqual([
      {keyValues: [{keyDefSystemId: 601, valueDefSystemId: 202}]},
    ]);
    expect([...(context.cones?.sgSystemIds ?? [])]).not.toContain(30);
    expect([...(context.seeds?.sgSystemIds ?? [])]).not.toContain(30);
    expect(context.input.graphSnapshot.sessionEdits.deletedSgs).toHaveLength(1);
  });

  it('rejects missing or foreign Values atomically before Phases 5 and 6', async () => {
    const selected = makeUsecase(100, [10, 20], [202]);
    const context = makeContext({
      subgraphSystemIds: [10, 20],
      requestedSgkvs: {10: [[202]], 20: [[999]]},
      selectedUsecases: [selected],
      committedUsecases: [selected],
    });
    const repository = makeRepository({
      baseline: [],
      resolved: [{keyDefSystemId: 601, valueDefSystemId: 202}],
    });

    const results = await runPhaseChain(context, repository.repository);

    expect(results.phase4.kind).toBe(RESULT_KIND.Fail);
    expect(results.phase4).toEqual(
      expect.objectContaining({
        issues: [
          expect.objectContaining({
            code: 'ARC-ROUTING-SGKV-VALUE-NOT-FOUND',
            impactedEntity: {entityType: 'Subgraph', systemId: 20},
          }),
        ],
      }),
    );
    expect(results.phase5).toBeNull();
    expect(results.phase6).toBeNull();
    expect(context.kvResolutions).toBeNull();
    expect(context.seeds).toBeNull();
    expect(context.cones).toBeNull();
  });

  it('rejects duplicate Keys in one SGKV before publishing any Phase 4 output', async () => {
    const selected = makeUsecase(100, [10], [201, 202]);
    const context = makeContext({
      subgraphSystemIds: [10],
      requestedSgkvs: {10: [[201, 202]]},
      selectedUsecases: [selected],
      committedUsecases: [selected],
    });
    const repository = makeRepository({
      baseline: [],
      resolved: [
        {keyDefSystemId: 601, valueDefSystemId: 201},
        {keyDefSystemId: 601, valueDefSystemId: 202},
      ],
    });

    const results = await runPhaseChain(context, repository.repository);

    expect(results.phase4.kind).toBe(RESULT_KIND.Fail);
    expect(results.phase4).toEqual(
      expect.objectContaining({
        issues: [
          expect.objectContaining({
            code: 'ARC-ROUTING-SGKV-MALFORMED',
            impactedEntity: {entityType: 'Subgraph', systemId: 10},
          }),
        ],
      }),
    );
    expect(results.phase5).toBeNull();
    expect(results.phase6).toBeNull();
    expect(context.kvResolutions).toBeNull();
  });

  it('seeds both endpoints of an added data link but not an added control link', async () => {
    const selected = makeUsecase(100, [10, 20], [101, 102]);
    const context = makeContext({
      subgraphSystemIds: [10, 20],
      requestedSgkvs: {10: [[101]], 20: [[102]]},
      selectedUsecases: [selected],
      committedUsecases: [selected],
      sessionEdits: {
        ...emptyGraphEdits(),
        addedDataLinks: [makeDataLink(1, 10, 20)],
        addedControlLinks: [makeControlLink(2, 10, 20)],
      },
      dataLinks: [makeDataLink(1, 10, 20)],
    });
    const repository = makeRepository({
      baseline: [
        {
          sgSystemId: 10,
          sgkvSystemId: 700,
          keyValues: [{keyDefSystemId: 501, valueDefSystemId: 101}],
        },
        {
          sgSystemId: 20,
          sgkvSystemId: 701,
          keyValues: [{keyDefSystemId: 502, valueDefSystemId: 102}],
        },
      ],
      resolved: [
        {keyDefSystemId: 501, valueDefSystemId: 101},
        {keyDefSystemId: 502, valueDefSystemId: 102},
      ],
    });

    const results = await runPhaseChain(context, repository.repository);

    expectSuccessfulChain(results);
    expect(context.seeds).toEqual({
      sgSystemIds: new Set([10, 20]),
      reasons: new Map([
        [10, 'LINK_ADDED'],
        [20, 'LINK_ADDED'],
      ]),
    });
  });

  it('handles deleted-link fragments without traversing deleted endpoints', async () => {
    const selected = makeUsecase(100, [10, 20], [101, 102]);
    const context = makeContext({
      subgraphSystemIds: [10, 20],
      requestedSgkvs: {10: [[101]], 20: [[102]]},
      selectedUsecases: [selected],
      committedUsecases: [selected],
      dataLinks: [makeDataLink(1, 10, 20)],
      sessionEdits: {
        ...emptyGraphEdits(),
        deletedDataLinks: [makeDataLink(2, 20, 30)],
      },
    });
    const repository = makeRepository({
      baseline: [
        {
          sgSystemId: 10,
          sgkvSystemId: 700,
          keyValues: [{keyDefSystemId: 501, valueDefSystemId: 101}],
        },
        {
          sgSystemId: 20,
          sgkvSystemId: 701,
          keyValues: [{keyDefSystemId: 502, valueDefSystemId: 102}],
        },
      ],
      resolved: [
        {keyDefSystemId: 501, valueDefSystemId: 101},
        {keyDefSystemId: 502, valueDefSystemId: 102},
      ],
    });

    const results = await runPhaseChain(context, repository.repository);

    expectSuccessfulChain(results);
    expect(context.seeds).toEqual({
      sgSystemIds: new Set([20]),
      reasons: new Map([[20, 'LINK_DELETED']]),
    });
    expect(context.cones).toEqual({
      sgSystemIds: new Set([10, 20]),
      rootSgs: new Set([10]),
    });
    expect([...context.cones.sgSystemIds]).not.toContain(30);
  });

  it('unions overlapping seeds and terminates on a data-link cycle', async () => {
    const selected = makeUsecase(100, [10, 20, 30], [101, 102, 103]);
    const context = makeContext({
      subgraphSystemIds: [10, 20, 30],
      requestedSgkvs: {10: [[101]], 20: [[102]], 30: [[103]]},
      selectedUsecases: [selected],
      committedUsecases: [selected],
      dataLinks: [
        makeDataLink(1, 10, 20),
        makeDataLink(2, 20, 30),
        makeDataLink(3, 30, 10),
      ],
      sessionEdits: {
        ...emptyGraphEdits(),
        addedDataLinks: [makeDataLink(4, 10, 20)],
      },
    });
    const repository = makeRepository({
      baseline: [
        {
          sgSystemId: 10,
          sgkvSystemId: 700,
          keyValues: [{keyDefSystemId: 501, valueDefSystemId: 101}],
        },
        {
          sgSystemId: 20,
          sgkvSystemId: 701,
          keyValues: [{keyDefSystemId: 502, valueDefSystemId: 102}],
        },
        {
          sgSystemId: 30,
          sgkvSystemId: 702,
          keyValues: [{keyDefSystemId: 503, valueDefSystemId: 103}],
        },
      ],
      resolved: [
        {keyDefSystemId: 501, valueDefSystemId: 101},
        {keyDefSystemId: 502, valueDefSystemId: 102},
        {keyDefSystemId: 503, valueDefSystemId: 103},
      ],
    });

    const results = await runPhaseChain(context, repository.repository);

    expectSuccessfulChain(results);
    expect(context.cones).toEqual({
      sgSystemIds: new Set([10, 20, 30]),
      rootSgs: new Set(),
    });
  });

  it('marks unchanged out-of-selection SGs without using excluded SGs as routing scope', async () => {
    const selected = makeUsecase(100, [10], [101, 102]);
    const context = makeContext({
      subgraphSystemIds: [10, 20],
      requestedSgkvs: {10: [[101]], 20: [[102]]},
      selectedUsecases: [selected],
      committedUsecases: [selected, makeUsecase(101, [20], [102])],
      excludedSubgraphSystemIds: [30],
      dataLinks: [makeDataLink(1, 10, 20), makeDataLink(2, 10, 30)],
    });
    const repository = makeRepository({
      baseline: [
        {
          sgSystemId: 10,
          sgkvSystemId: 700,
          keyValues: [{keyDefSystemId: 501, valueDefSystemId: 101}],
        },
        {
          sgSystemId: 20,
          sgkvSystemId: 701,
          keyValues: [{keyDefSystemId: 502, valueDefSystemId: 102}],
        },
      ],
      resolved: [
        {keyDefSystemId: 501, valueDefSystemId: 101},
        {keyDefSystemId: 502, valueDefSystemId: 102},
      ],
    });

    const results = await runPhaseChain(context, repository.repository);

    expectSuccessfulChain(results);
    expect(context.seeds).toEqual({
      sgSystemIds: new Set([20]),
      reasons: new Map([[20, 'OUT_OF_SELECTION']]),
    });
    expect(context.kvResolutions?.perSg.has(30)).toBe(false);
    expect(context.cones?.sgSystemIds).toEqual(new Set([10, 20]));
    expect([...(context.cones?.sgSystemIds ?? [])]).not.toContain(30);
  });
});
