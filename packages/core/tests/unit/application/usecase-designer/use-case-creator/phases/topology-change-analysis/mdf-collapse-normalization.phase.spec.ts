/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {RESULT_KIND} from '../../../../../../../src/application/shared/result/result.js';
import {RoutingContext} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';
import {
  createAutoRoutingInput,
  emptyGraphEdits,
} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {USECASE_TOPOLOGY_DECISION_KIND} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import {TopologyChangeAnalysisPhase} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/topology-change-analysis/topology-change-analysis.phase.js';
import type {DataLink} from '../../../../../../../src/domain/entities/usecase-data/links/data-link.js';
import {DATA_LINK_TYPE} from '../../../../../../../src/domain/entities/usecase-data/links/data-link-type.js';
import {UseCase} from '../../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';

function dataLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): DataLink {
  return {
    systemId,
    fileSystemId: 1,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
    linkType: DATA_LINK_TYPE.Normal,
  } as DataLink;
}

function usecase(
  systemId: number,
  subgraphSystemIds: readonly number[],
  pairs: ReadonlyArray<readonly [number, number]>,
): UseCase {
  return new UseCase({
    systemId,
    fileSystemId: 1,
    keyVector: {valueSystemIds: []},
    subgraphSystemIds: [...subgraphSystemIds],
    subgraphPairs: pairs.map(
      ([sourceSubgraphSystemId, destSubgraphSystemId]) => ({
        sourceSubgraphSystemId,
        destSubgraphSystemId,
      }),
    ),
    type: 'LINKED',
  });
}

function createFixture(options: {
  readonly usecases: readonly UseCase[];
  readonly deletedMdfSubgraphSystemIds: readonly number[];
  readonly deletedSubgraphSystemIds: readonly number[];
  readonly committedDataLinks: readonly DataLink[];
  readonly addedDataLinks: readonly DataLink[];
  readonly selectedUsecases?: readonly UseCase[];
}) {
  const allSubgraphSystemIds = new Set<number>();
  for (const currentUsecase of options.usecases) {
    for (const subgraphSystemId of currentUsecase.subgraphSystemIds)
      allSubgraphSystemIds.add(subgraphSystemId);
  }
  const graphSnapshot = {
    subgraphs: [...allSubgraphSystemIds].map(systemId => ({
      subgraph: {systemId} as never,
      requestedSgkvs: [],
    })),
    mdf: {
      effective: new Set<number>(),
      deleted: new Set(options.deletedMdfSubgraphSystemIds),
    },
    committedUsecases: [...options.usecases],
    committedDataLinks: [...options.committedDataLinks],
    routableDataLinks: [...options.addedDataLinks],
    routableControlLinks: [],
    overlayDataLinks: [...options.addedDataLinks],
    overlayControlLinks: [],
    sessionEdits: {
      ...emptyGraphEdits(),
      addedDataLinks: [...options.addedDataLinks],
      deletedSgs: options.deletedSubgraphSystemIds.map(
        systemId => ({systemId}) as never,
      ),
      deletedDataLinks: [...options.committedDataLinks],
    },
  };
  const input = createAutoRoutingInput({
    fileSystemId: 1,
    selection: {
      selectedUsecaseSystemIds: (options.selectedUsecases ?? []).map(
        currentUsecase => currentUsecase.systemId,
      ),
      activeSubgraphs: [...allSubgraphSystemIds].map(systemId => ({
        systemId,
        sgkvs: [],
      })),
      excludedSubgraphSystemIds: [],
      excludedDataLinkSystemIds: [],
      excludedControlLinkSystemIds: [],
    },
    selectedUsecases: [...(options.selectedUsecases ?? [])],
    graphSnapshot,
    activeManualUsecaseEdits: [],
  });
  return new RoutingContext(input);
}

async function analyze(context: RoutingContext) {
  return new TopologyChangeAnalysisPhase().run(context, {
    getSgkvs: async () => [],
  } as never);
}

describe('MDF collapse normalization', () => {
  it('stages a direct replacement for an unselected usecase with one deleted MDF hop', async () => {
    const committed = usecase(
      500,
      [10, 30, 20],
      [
        [10, 30],
        [30, 20],
      ],
    );
    const context = createFixture({
      usecases: [committed],
      deletedMdfSubgraphSystemIds: [30],
      deletedSubgraphSystemIds: [30],
      committedDataLinks: [dataLink(101, 10, 30), dataLink(102, 30, 20)],
      addedDataLinks: [dataLink(201, 10, 20)],
    });

    const result = await analyze(context);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(context.topologyChangeAnalysis?.decisions).toEqual([
      expect.objectContaining({
        kind: USECASE_TOPOLOGY_DECISION_KIND.MdfNormalization,
        usecase: committed,
        structuralChange: expect.objectContaining({
          removedSubgraphSystemIds: [30],
          removedPairs: [
            {sourceSubgraphSystemId: 10, destSubgraphSystemId: 30},
            {sourceSubgraphSystemId: 30, destSubgraphSystemId: 20},
          ],
          addedPairs: [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
          resultingSubgraphSystemIds: [10, 20],
        }),
      }),
    ]);
  });

  it('keeps ordinary handling when deleted non-MDF impact coexists', async () => {
    const committed = usecase(
      501,
      [10, 30, 40, 20],
      [
        [10, 30],
        [30, 40],
        [40, 20],
      ],
    );
    const context = createFixture({
      usecases: [committed],
      selectedUsecases: [committed],
      deletedMdfSubgraphSystemIds: [30],
      deletedSubgraphSystemIds: [30, 40],
      committedDataLinks: [
        dataLink(103, 10, 30),
        dataLink(104, 30, 40),
        dataLink(105, 40, 20),
      ],
      addedDataLinks: [dataLink(202, 10, 20)],
    });

    const result = await analyze(context);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(context.topologyChangeAnalysis?.decisions).toEqual([
      expect.objectContaining({
        kind: USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
        usecase: committed,
      }),
    ]);
  });

  it('normalizes independent deleted MDF chains independently', async () => {
    const first = usecase(
      502,
      [10, 30, 20],
      [
        [10, 30],
        [30, 20],
      ],
    );
    const second = usecase(
      503,
      [50, 31, 60],
      [
        [50, 31],
        [31, 60],
      ],
    );
    const context = createFixture({
      usecases: [first, second],
      deletedMdfSubgraphSystemIds: [30, 31],
      deletedSubgraphSystemIds: [30, 31],
      committedDataLinks: [
        dataLink(106, 10, 30),
        dataLink(107, 30, 20),
        dataLink(108, 50, 31),
        dataLink(109, 31, 60),
      ],
      addedDataLinks: [dataLink(203, 10, 20), dataLink(204, 50, 60)],
    });

    const result = await analyze(context);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(
      context.topologyChangeAnalysis?.decisions.map(decision => [
        decision.kind,
        decision.usecase.systemId,
      ]),
    ).toEqual([
      [USECASE_TOPOLOGY_DECISION_KIND.MdfNormalization, 502],
      [USECASE_TOPOLOGY_DECISION_KIND.MdfNormalization, 503],
    ]);
  });
});
