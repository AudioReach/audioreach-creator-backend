/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {UseCase} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
import {RoutingContext} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';
import {OrphanValidationService} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/orphan-validation.service.js';
import {ROUTING_MODE} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';

function makeContext(): RoutingContext {
  return new RoutingContext({
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
      subgraphs: [
        {subgraph: {systemId: 10, sgkvs: []}, requestedSgkvs: [], isMdf: false},
        {
          subgraph: {systemId: 20, sgkvs: [{}]},
          requestedSgkvs: [],
          isMdf: false,
        },
      ],
      routableDataLinks: [],
      routableControlLinks: [],
      overlayDataLinks: [
        {systemId: 300, sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
      ],
      overlayControlLinks: [
        {systemId: 400, sourceSubgraphSystemId: 20, destSubgraphSystemId: 10},
      ],
      committedUsecases: [
        new UseCase({
          systemId: 1,
          fileSystemId: 1,
          keyVector: {valueSystemIds: [11]},
          subgraphSystemIds: [10],
          subgraphPairs: [],
        }),
      ],
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
    activeManualUsecaseEdits: [],
  } as never);
}

describe('OrphanValidationService', () => {
  it('publishes sorted non-blocking warnings and SGKV hints from the projected snapshot', async () => {
    const context = makeContext();
    const subsystemRepository = {
      findOrphanSubsystemSystemIds: async () => [200],
    } as never;
    const result = await new OrphanValidationService().run(
      context,
      subsystemRepository,
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(context.warnings.map(issue => issue.code)).toEqual([
      'ARC-ROUTING-ORPHAN-SUBGRAPH',
      'ARC-ROUTING-ORPHAN-SG-HAS-KVS',
      'ARC-ROUTING-ORPHAN-SUBSYSTEM',
      'ARC-ROUTING-ORPHAN-DATA-LINK',
      'ARC-ROUTING-ORPHAN-CONTROL-LINK',
    ]);
    expect(
      context.orphanCandidates.map(candidate => candidate.systemId),
    ).toEqual([20, 200, 300, 400]);
  });
});
