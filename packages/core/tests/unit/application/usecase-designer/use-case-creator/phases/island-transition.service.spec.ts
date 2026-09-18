/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
import {
  createAutoRoutingInput,
  createManualRoutingInput,
  emptyGraphEdits,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {RoutingContext} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';
import {DELETED_COMPONENT_TYPE} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import {IslandTransitionService} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/island-transition.service.js';
import {UseCase} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import type {ControlLink} from '../../../../../../src/domain/entities/usecase-data/links/control-link.js';
import type {DataLink} from '../../../../../../src/domain/entities/usecase-data/links/data-link.js';
import type {DeletionAnalysis} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';

type UsecaseType = 'EC' | 'ISLAND' | 'LINKED';

interface FixtureOptions {
  readonly mode?: 'AUTO' | 'MANUAL';
  readonly usecases?: readonly UseCase[];
  readonly subgraphIds?: readonly number[];
  readonly mdfSubgraphIds?: readonly number[];
  readonly routableDataLinks?: readonly DataLink[];
  readonly routableControlLinks?: readonly ControlLink[];
  readonly deletionAnalysis?: DeletionAnalysis | null;
}

function usecase(
  systemId: number,
  subgraphSystemIds: readonly number[],
  subgraphPairs: readonly {
    sourceSubgraphSystemId: number;
    destSubgraphSystemId: number;
  }[],
  type: UsecaseType = 'ISLAND',
): UseCase {
  return new UseCase({
    systemId,
    fileSystemId: 1,
    keyVector: {valueSystemIds: []},
    subgraphSystemIds: [...subgraphSystemIds],
    subgraphPairs: subgraphPairs.map(pair => ({...pair})),
    type,
  });
}

function dataLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): DataLink {
  return {
    systemId,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
    isEc: false,
  } as unknown as DataLink;
}

function controlLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): ControlLink {
  return {
    systemId,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
  } as unknown as ControlLink;
}

function emptyDeletionAnalysis(): DeletionAnalysis {
  return {
    affectedUsecaseSystemIds: new Set(),
    markedForDeletion: [],
    preservedUsecases: [],
    islandUseCaseCandidates: [],
    reconstructionPaths: [],
  };
}

function createFixture(options: FixtureOptions = {}) {
  const committedUsecases = [...(options.usecases ?? [])];
  const routableDataLinks = [...(options.routableDataLinks ?? [])];
  const routableControlLinks = [...(options.routableControlLinks ?? [])];
  const inferredSubgraphIds = new Set<number>(options.subgraphIds ?? []);
  if (options.subgraphIds === undefined) {
    for (const currentUsecase of committedUsecases) {
      for (const subgraphSystemId of currentUsecase.subgraphSystemIds) {
        inferredSubgraphIds.add(subgraphSystemId);
      }
    }
    for (const link of [...routableDataLinks, ...routableControlLinks]) {
      inferredSubgraphIds.add(link.sourceSubgraphSystemId);
      inferredSubgraphIds.add(link.destSubgraphSystemId);
    }
  }
  const subgraphIds = [...inferredSubgraphIds];
  const inputInit = {
    fileSystemId: 1,
    selectedUsecases: committedUsecases,
    requestPolicy: {
      requestedSubgraphSystemIds: new Set(subgraphIds),
      explicitlyExcludedSubgraphSystemIds: new Set<number>(),
      explicitlyExcludedDataLinkSystemIds: new Set<number>(),
      explicitlyExcludedControlLinkSystemIds: new Set<number>(),
    },
    graphSnapshot: {
      subgraphs: subgraphIds.map(systemId => ({
        subgraph: {systemId} as never,
        requestedSgkvs: [],
        isMdf: options.mdfSubgraphIds?.includes(systemId) ?? false,
      })),
      routableDataLinks,
      routableControlLinks,
      overlayDataLinks: [],
      overlayControlLinks: [],
      committedUsecases,
      sessionEdits: emptyGraphEdits(),
    },
  };
  const input =
    options.mode === 'MANUAL'
      ? createManualRoutingInput({...inputInit, manualTopology: {pairs: []}})
      : createAutoRoutingInput(inputInit);
  const context = new RoutingContext(input);
  context.deletionAnalysis =
    options.deletionAnalysis ?? emptyDeletionAnalysis();
  const repositoryAccess = jest.fn(() => {
    throw new Error('Phase 3 must not access repositories');
  });
  const uow = new Proxy({}, {get: () => repositoryAccess});
  return {context, uow, repositoryAccess};
}

function runPhase(fixture: ReturnType<typeof createFixture>) {
  return new IslandTransitionService().run(
    fixture.context,
    fixture.uow as never,
  );
}

describe('IslandTransitionService', () => {
  it('returns success without descriptors or repository access when deletion analysis is null', async () => {
    const fixture = createFixture({
      usecases: [
        usecase(
          1,
          [1, 2],
          [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 2}],
        ),
      ],
      routableDataLinks: [dataLink(101, 1, 2)],
      deletionAnalysis: null,
    });
    fixture.context.deletionAnalysis = null;

    const result = await runPhase(fixture);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(fixture.context.islandTransitions).toEqual([]);
    expect(fixture.repositoryAccess).not.toHaveBeenCalled();
  });

  it('is a no-op in manual mode', async () => {
    const fixture = createFixture({
      mode: 'MANUAL',
      usecases: [
        usecase(
          1,
          [1, 2],
          [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 2}],
        ),
      ],
      routableDataLinks: [dataLink(101, 1, 2)],
    });

    const result = await runPhase(fixture);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(fixture.context.islandTransitions).toEqual([]);
    expect(fixture.repositoryAccess).not.toHaveBeenCalled();
  });

  it('does not emit descriptors when there are no eligible ISLAND usecases', async () => {
    const fixture = createFixture({
      usecases: [
        usecase(
          1,
          [1, 2],
          [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 2}],
          'LINKED',
        ),
      ],
      routableDataLinks: [dataLink(101, 1, 2)],
    });

    await runPhase(fixture);

    expect(fixture.context.islandTransitions).toEqual([]);
  });

  it('promotes a forward-covered pair without a direction correction', async () => {
    const currentUsecase = usecase(
      1,
      [1, 2],
      [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 2}],
    );
    const fixture = createFixture({
      usecases: [currentUsecase],
      routableDataLinks: [dataLink(101, 1, 2)],
      routableControlLinks: [controlLink(201, 1, 2)],
    });

    await runPhase(fixture);

    expect(fixture.context.islandTransitions).toEqual([
      {
        usecase: currentUsecase,
        directionCorrections: [],
        addedSubgraphSystemIds: [],
        addedPairs: [],
      },
    ]);
  });

  it('promotes a reverse-covered control-held pair with one direction correction', async () => {
    const currentUsecase = usecase(
      1,
      [1, 2],
      [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 2}],
    );
    const fixture = createFixture({
      usecases: [currentUsecase],
      routableDataLinks: [dataLink(101, 2, 1)],
      routableControlLinks: [controlLink(201, 2, 1)],
    });

    await runPhase(fixture);

    expect(fixture.context.islandTransitions[0]).toEqual({
      usecase: currentUsecase,
      directionCorrections: [
        {
          currentSourceSubgraphSystemId: 1,
          currentDestSubgraphSystemId: 2,
          newSourceSubgraphSystemId: 2,
          newDestSubgraphSystemId: 1,
        },
      ],
      addedSubgraphSystemIds: [],
      addedPairs: [],
    });
  });

  it('does not correct or promote a reverse data link without a control link', async () => {
    const fixture = createFixture({
      usecases: [
        usecase(
          1,
          [1, 2],
          [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 2}],
        ),
      ],
      routableDataLinks: [dataLink(101, 2, 1)],
    });

    await runPhase(fixture);

    expect(fixture.context.islandTransitions).toEqual([]);
  });

  it('leaves an uncovered pair ISLAND without a descriptor', async () => {
    const fixture = createFixture({
      usecases: [
        usecase(
          1,
          [1, 2],
          [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 2}],
        ),
      ],
    });

    await runPhase(fixture);

    expect(fixture.context.islandTransitions).toEqual([]);
  });

  it('emits one transition when all stored pairs are directly covered', async () => {
    // Every stored pair already has directed data coverage, so Phase 3 should
    // promote the UC without inventing bridge SGs or bridge pairs.
    const currentUsecase = usecase(
      1,
      [1, 2, 3],
      [
        {sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
        {sourceSubgraphSystemId: 2, destSubgraphSystemId: 3},
      ],
    );
    const fixture = createFixture({
      usecases: [currentUsecase],
      routableDataLinks: [dataLink(101, 1, 2), dataLink(102, 2, 3)],
    });

    await runPhase(fixture);

    expect(fixture.context.islandTransitions).toHaveLength(1);
    expect(fixture.context.islandTransitions[0]).toMatchObject({
      usecase: currentUsecase,
      directionCorrections: [],
      addedSubgraphSystemIds: [],
      addedPairs: [],
    });
  });

  it('discards preliminary corrections when another pair is uncovered', async () => {
    // The first pair is correctable through its reverse data link and control
    // link, but the second pair is uncovered. No partial transition may leak.
    const currentUsecase = usecase(
      1,
      [1, 2, 3, 4],
      [
        {sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
        {sourceSubgraphSystemId: 3, destSubgraphSystemId: 4},
      ],
    );
    const fixture = createFixture({
      usecases: [currentUsecase],
      routableDataLinks: [dataLink(101, 2, 1)],
      routableControlLinks: [controlLink(201, 1, 2)],
    });

    await runPhase(fixture);

    expect(fixture.context.islandTransitions).toEqual([]);
  });

  it('promotes a pair covered by one MDF bridge and records both mediated pairs', async () => {
    const currentUsecase = usecase(
      1,
      [1, 3],
      [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 3}],
    );
    const fixture = createFixture({
      usecases: [currentUsecase],
      subgraphIds: [1, 2, 3],
      mdfSubgraphIds: [2],
      routableDataLinks: [dataLink(101, 1, 2), dataLink(102, 2, 3)],
    });

    await runPhase(fixture);

    expect(fixture.context.islandTransitions[0]).toMatchObject({
      usecase: currentUsecase,
      addedSubgraphSystemIds: [2],
      addedPairs: [
        {sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
        {sourceSubgraphSystemId: 2, destSubgraphSystemId: 3},
      ],
    });
  });

  it('records every MDF bridge in a deterministic multi-MDF chain', async () => {
    const currentUsecase = usecase(
      1,
      [1, 4],
      [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 4}],
    );
    const fixture = createFixture({
      usecases: [currentUsecase],
      subgraphIds: [1, 2, 3, 4],
      mdfSubgraphIds: [2, 3],
      routableDataLinks: [
        dataLink(101, 1, 2),
        dataLink(102, 2, 3),
        dataLink(103, 3, 4),
      ],
    });

    await runPhase(fixture);

    expect(fixture.context.islandTransitions[0]).toMatchObject({
      addedSubgraphSystemIds: [2, 3],
      addedPairs: [
        {sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
        {sourceSubgraphSystemId: 2, destSubgraphSystemId: 3},
        {sourceSubgraphSystemId: 3, destSubgraphSystemId: 4},
      ],
    });
  });

  it('terminates an MDF cycle and still finds a valid bridge path', async () => {
    const currentUsecase = usecase(
      1,
      [1, 3],
      [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 3}],
    );
    const fixture = createFixture({
      usecases: [currentUsecase],
      subgraphIds: [1, 2, 3],
      mdfSubgraphIds: [2],
      routableDataLinks: [
        dataLink(101, 1, 2),
        dataLink(102, 2, 1),
        dataLink(103, 2, 3),
      ],
    });

    await runPhase(fixture);

    expect(fixture.context.islandTransitions[0]).toMatchObject({
      usecase: currentUsecase,
      addedSubgraphSystemIds: [2],
      addedPairs: [
        {sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
        {sourceSubgraphSystemId: 2, destSubgraphSystemId: 3},
      ],
    });
  });

  it('does not treat a non-MDF intermediate as coverage', async () => {
    const fixture = createFixture({
      usecases: [
        usecase(
          1,
          [1, 3],
          [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 3}],
        ),
      ],
      subgraphIds: [1, 2, 3],
      routableDataLinks: [dataLink(101, 1, 2), dataLink(102, 2, 3)],
    });

    await runPhase(fixture);

    expect(fixture.context.islandTransitions).toEqual([]);
  });

  it('skips an ISLAND usecase marked for deletion', async () => {
    const currentUsecase = usecase(
      1,
      [1, 2],
      [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 2}],
    );
    const deletionAnalysis: DeletionAnalysis = {
      ...emptyDeletionAnalysis(),
      markedForDeletion: [
        {
          usecase: currentUsecase,
          deletedComponent: {
            type: DELETED_COMPONENT_TYPE.DataLink,
            systemId: 101,
          },
        },
      ],
    };
    const fixture = createFixture({
      usecases: [currentUsecase],
      routableDataLinks: [dataLink(101, 1, 2)],
      deletionAnalysis,
    });

    await runPhase(fixture);

    expect(fixture.context.islandTransitions).toEqual([]);
  });

  it('ignores bridge paths that leave effective snapshot scope', async () => {
    // SG 99 is an MDF bridge candidate in the link collection, but it is not
    // in graphSnapshot.subgraphs and therefore cannot restore coverage.
    const fixture = createFixture({
      usecases: [
        usecase(
          1,
          [1, 2],
          [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 2}],
        ),
      ],
      subgraphIds: [1, 2],
      routableDataLinks: [dataLink(101, 1, 99), dataLink(102, 99, 2)],
      mdfSubgraphIds: [99],
    });

    await runPhase(fixture);

    expect(fixture.context.islandTransitions).toEqual([]);
  });

  it('orders UCs and corrections deterministically and deduplicates bridge additions', async () => {
    const lowerSystemIdUsecase = usecase(
      10,
      [1, 2, 3, 4, 5, 7, 8],
      [
        {sourceSubgraphSystemId: 7, destSubgraphSystemId: 8},
        {sourceSubgraphSystemId: 1, destSubgraphSystemId: 4},
        {sourceSubgraphSystemId: 1, destSubgraphSystemId: 5},
        {sourceSubgraphSystemId: 2, destSubgraphSystemId: 3},
      ],
    );
    const higherSystemIdUsecase = usecase(
      20,
      [9, 10],
      [{sourceSubgraphSystemId: 9, destSubgraphSystemId: 10}],
    );
    const fixture = createFixture({
      usecases: [higherSystemIdUsecase, lowerSystemIdUsecase],
      subgraphIds: [1, 2, 3, 4, 5, 7, 8, 9, 10],
      mdfSubgraphIds: [3],
      routableDataLinks: [
        dataLink(101, 8, 7),
        dataLink(102, 1, 3),
        dataLink(103, 3, 4),
        dataLink(104, 3, 5),
        dataLink(105, 3, 2),
        dataLink(106, 9, 10),
      ],
      routableControlLinks: [controlLink(201, 7, 8), controlLink(202, 2, 3)],
    });

    await runPhase(fixture);

    expect(
      fixture.context.islandTransitions.map(
        transition => transition.usecase.systemId,
      ),
    ).toEqual([10, 20]);
    expect(fixture.context.islandTransitions[0]).toMatchObject({
      directionCorrections: [
        {
          currentSourceSubgraphSystemId: 2,
          currentDestSubgraphSystemId: 3,
        },
        {
          currentSourceSubgraphSystemId: 7,
          currentDestSubgraphSystemId: 8,
        },
      ],
      addedSubgraphSystemIds: [3],
      addedPairs: [
        {sourceSubgraphSystemId: 1, destSubgraphSystemId: 3},
        {sourceSubgraphSystemId: 3, destSubgraphSystemId: 4},
        {sourceSubgraphSystemId: 3, destSubgraphSystemId: 5},
      ],
    });
  });

  it('preserves existing Phase 2 warnings and emits no Phase 3 warning', async () => {
    const currentUsecase = usecase(
      1,
      [1, 2],
      [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 2}],
    );
    const fixture = createFixture({
      usecases: [currentUsecase],
      routableDataLinks: [dataLink(101, 1, 2)],
    });
    const existingWarning = {code: 'ARC-ROUTING-UC-AUTO-ISLAND'} as never;
    fixture.context.warnings.push(existingWarning);

    await runPhase(fixture);

    expect(fixture.context.warnings).toEqual([existingWarning]);
    expect(fixture.repositoryAccess).not.toHaveBeenCalled();
  });

  it('is idempotent when invoked more than once', async () => {
    const currentUsecase = usecase(
      1,
      [1, 2],
      [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 2}],
    );
    const fixture = createFixture({
      usecases: [currentUsecase],
      routableDataLinks: [dataLink(101, 1, 2)],
    });

    await runPhase(fixture);
    await runPhase(fixture);

    expect(fixture.context.islandTransitions).toHaveLength(1);
    expect(fixture.context.islandTransitions[0].usecase).toBe(currentUsecase);
  });
});
