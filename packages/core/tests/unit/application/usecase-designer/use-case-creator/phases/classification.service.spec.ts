/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import type {UseCase} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import type {ActiveManualUsecaseEdit} from '../../../../../../src/application/ports/persistence/repositories/usecase/usecase.repository.js';
import {createAutoRoutingInput} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {RoutingContext} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';
import {
  ROUTING_CLASSIFICATION_KIND,
  type RoutingCombination,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import {ClassificationService} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/classification.service.js';

function usecase(
  systemId: number,
  subgraphSystemIds: number[],
  subgraphPairs: Array<[number, number]>,
  valueSystemIds: number[],
): UseCase {
  return {
    systemId,
    fileSystemId: 1,
    subgraphSystemIds,
    subgraphPairs: subgraphPairs.map(
      ([sourceSubgraphSystemId, destSubgraphSystemId]) => ({
        sourceSubgraphSystemId,
        destSubgraphSystemId,
      }),
    ),
    keyVector: {valueSystemIds},
  } as UseCase;
}

function combination(
  path: number[],
  values: number[],
  assignments: Record<number, number[][]> = {},
): RoutingCombination {
  return {
    path: {
      subgraphSystemIds: path,
      termination: 'NATURAL_LEAF',
      ecBoundaryLinkId: null,
    },
    sgkvAssignment: new Map(
      path.map(systemId => [
        systemId,
        {
          keyValues: (assignments[systemId] ?? []).map(
            ([keyDefSystemId, valueDefSystemId]) => ({
              keyDefSystemId,
              valueDefSystemId,
            }),
          ),
        },
      ]),
    ),
    gkv: values.map(valueSystemId => ({
      keyDefSystemId: valueSystemId + 1000,
      valueDefSystemId: valueSystemId,
    })),
  };
}

function context(
  committedUsecases: UseCase[] = [],
  activeManualUsecaseEdits: ActiveManualUsecaseEdit[] = [],
): RoutingContext {
  return new RoutingContext(
    createAutoRoutingInput({
      fileSystemId: 1,
      selection: {
        selectedUsecaseSystemIds: [],
        activeSubgraphs: [],
        excludedSubgraphSystemIds: [],
        excludedDataLinkSystemIds: [],
        excludedControlLinkSystemIds: [],
      },
      selectedUsecases: [],
      graphSnapshot: {
        subgraphs: [],
        routableDataLinks: [],
        routableControlLinks: [],
        overlayDataLinks: [],
        overlayControlLinks: [],
        committedUsecases,
        sessionEdits: {
          addedSgs: [],
          deletedSgs: [],
          addedDataLinks: [],
          deletedDataLinks: [],
          addedControlLinks: [],
          deletedControlLinks: [],
        },
      },
      activeManualUsecaseEdits,
    }),
  );
}

describe('ClassificationService', () => {
  it('classifies exact matches, interior extensions, and creates in publication order', async () => {
    const existing = usecase(1, [10, 30], [[10, 30]], [100, 200]);
    const routingContext = context([existing]);
    routingContext.routingCandidates.combinations.push(
      combination([40, 50], [300]),
      combination([10, 30], [200, 100]),
      combination([10, 20, 30], [100, 200], {20: []}),
    );

    const result = await new ClassificationService().run(routingContext);

    expect(result.kind).toBe('OK');
    expect(
      routingContext.classifiedUcs.map(classification => classification.kind),
    ).toEqual([
      ROUTING_CLASSIFICATION_KIND.Create,
      ROUTING_CLASSIFICATION_KIND.ExactMatch,
      ROUTING_CLASSIFICATION_KIND.InteriorExtension,
    ]);
    expect(routingContext.classifiedUcs[1]).toEqual(
      expect.objectContaining({existingUsecase: existing}),
    );
  });

  it('marks an interior extension to a Phase 2 deletion for cancellation', async () => {
    const existing = usecase(1, [10, 30], [[10, 30]], [100, 200]);
    const routingContext = context([existing]);
    routingContext.deletionAnalysis = {
      affectedUsecaseSystemIds: new Set([1]),
      markedForDeletion: [
        {
          usecase: existing,
          deletedComponent: {type: 'SUBGRAPH', systemId: 20},
        },
      ],
      preservedUsecases: [],
      islandUseCaseCandidates: [],
      reconstructionPaths: [],
    };
    routingContext.routingCandidates.combinations.push(
      combination([10, 20, 30], [100, 200], {20: []}),
    );

    await new ClassificationService().run(routingContext);

    expect(routingContext.classifiedUcs[0]).toEqual(
      expect.objectContaining({
        kind: ROUTING_CLASSIFICATION_KIND.InteriorExtension,
        cancelPendingDelete: true,
      }),
    );
  });

  it('blocks unresolved same-GKV collisions without publishing classifications', async () => {
    const routingContext = context();
    routingContext.routingCandidates.combinations.push(
      combination([1, 2], [100]),
      combination([3, 4], [100]),
    );

    const result = await new ClassificationService().run(routingContext);

    expect(result.kind).toBe('FAIL');
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'ARC-ROUTING-SAME-GKV-CHOICE-REQUIRED',
        fixOptions: expect.arrayContaining([
          expect.objectContaining({
            commandType: 'ResolveSameGkvCollisionCommand',
            commandPayload: expect.objectContaining({
              mode: 'PATH_A',
              replayInput: expect.any(Object),
              collisionOperands: [
                expect.objectContaining({
                  kind: 'NEW',
                  subgraphSystemIds: [1, 2],
                }),
                expect.objectContaining({
                  kind: 'NEW',
                  subgraphSystemIds: [3, 4],
                }),
              ],
              selectedTopology: expect.objectContaining({
                subgraphSystemIds: [1, 2],
              }),
            }),
            description: expect.stringContaining('SGs [1, 2]'),
          }),
        ]),
      }),
    ]);
    expect(routingContext.classifiedUcs).toEqual([]);
  });

  it('recognizes an active MANUAL materialization and suppresses automatic classification', async () => {
    const manualUsecase = usecase(99, [1, 2], [[1, 2]], [100]);
    const routingContext = context(
      [],
      [
        {
          changeId: 99,
          operation: 'CREATE',
          usecase: manualUsecase,
          referencedComponents: {
            sgSystemIds: [1, 2],
            dataLinkSystemIds: [],
            controlLinkSystemIds: [],
          },
        } as ActiveManualUsecaseEdit,
      ],
    );
    routingContext.routingCandidates.combinations.push(
      combination([1, 2], [100]),
      combination([3, 4], [100]),
    );

    const result = await new ClassificationService().run(routingContext);

    expect(result.kind).toBe('OK');
    expect(routingContext.classifiedUcs).toEqual([]);
  });

  it('classifies dormant EC bridge candidates for Phase 11 staging', async () => {
    const routingContext = context();
    routingContext.routingCandidates.ecBridgeCandidates.push(
      combination([10, 20], [100]),
    );

    const result = await new ClassificationService().run(routingContext);

    expect(result.kind).toBe('OK');
    expect(routingContext.classifiedUcs).toEqual([
      expect.objectContaining({
        kind: ROUTING_CLASSIFICATION_KIND.Create,
        candidate: expect.objectContaining({
          path: expect.objectContaining({subgraphSystemIds: [10, 20]}),
        }),
      }),
    ]);
  });
});
