/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {UseCase} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import {RoutingContext} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';
import {buildProjectedUsecaseTopology} from '../../../../../../src/application/usecase-designer/use-case-creator/shared/projected-usecase-topology.js';
import {ROUTING_MODE} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';

function input(
  committedUsecases: readonly UseCase[],
  activeManualUsecaseEdits: readonly unknown[] = [],
) {
  return {
    mode: ROUTING_MODE.Auto,
    fileSystemId: 1,
    selectedUsecases: [],
    requestPolicy: {
      requestedSubgraphSystemIds: new Set<number>(),
      explicitlyExcludedSubgraphSystemIds: new Set<number>(),
      explicitlyExcludedDataLinkSystemIds: new Set<number>(),
      explicitlyExcludedControlLinkSystemIds: new Set<number>(),
    },
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
    replayInput: {
      selectedUsecaseSystemIds: [],
      activeSubgraphs: [],
      excludedSubgraphSystemIds: [],
      excludedDataLinkSystemIds: [],
      excludedControlLinkSystemIds: [],
    },
    activeManualUsecaseEdits,
  } as never;
}

describe('buildProjectedUsecaseTopology', () => {
  it('replaces a committed UC with the effective MANUAL overlay without mutating either entity', () => {
    const committed = new UseCase({
      systemId: 7,
      fileSystemId: 1,
      keyVector: {valueSystemIds: [11]},
      subgraphSystemIds: [10, 20],
      subgraphPairs: [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
    });
    const edited = new UseCase({
      systemId: 7,
      fileSystemId: 1,
      keyVector: {valueSystemIds: [11]},
      subgraphSystemIds: [20, 30],
      subgraphPairs: [{sourceSubgraphSystemId: 20, destSubgraphSystemId: 30}],
    });
    const context = new RoutingContext(
      input(
        [committed],
        [
          {
            changeId: 1,
            usecase: edited,
            operation: 'UPDATE',
            referencedComponents: null,
          },
        ],
      ),
    );

    const projected = buildProjectedUsecaseTopology(context);

    expect([...projected.subgraphSystemIds]).toEqual([20, 30]);
    expect([...projected.directedPairKeys]).toEqual(['20>30']);
    expect(committed.subgraphSystemIds).toEqual([10, 20]);
  });
});
