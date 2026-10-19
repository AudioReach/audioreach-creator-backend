/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import type {ActiveManualUsecaseEdit} from '../../../../../../src/application/ports/persistence/repositories/usecase/usecase.repository.js';
import {CHANGE_OPERATION} from '../../../../../../src/application/shared/change-vocabulary.js';
import {
  USECASE_CANDIDATE_KIND,
  type AutoUsecaseCandidate,
  type ManualUsecaseCandidate,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import {SameGkvCollisionService} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/classification/same-gkv-collision.service.js';
import {RoutingIssueFactory} from '../../../../../../src/application/usecase-designer/use-case-creator/issues/routing-issue-factory.js';
import {UseCase} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';

const routingSelection = {
  selectedUsecaseSystemIds: [],
  activeSubgraphs: [],
  excludedSubgraphSystemIds: [],
  excludedDataLinkSystemIds: [],
  excludedControlLinkSystemIds: [],
};

function candidate(path: number[]): AutoUsecaseCandidate {
  return {
    kind: USECASE_CANDIDATE_KIND.Auto,
    path: {
      subgraphSystemIds: path,
      termination: 'NATURAL_LEAF',
      ecBoundaryLinkId: null,
    },
    sgkvAssignment: new Map(
      path.map((systemId, index) => [
        systemId,
        {
          keyValues:
            index === 0 ? [{keyDefSystemId: 1, valueDefSystemId: 100}] : [],
        },
      ]),
    ),
    gkv: [{keyDefSystemId: 1, valueDefSystemId: 100}],
  };
}

function existing(path: number[], systemId: number): UseCase {
  return new UseCase({
    systemId,
    fileSystemId: 1,
    keyVector: {valueSystemIds: [100]},
    subgraphSystemIds: path,
    subgraphPairs: path.slice(1).map((destSubgraphSystemId, index) => ({
      sourceSubgraphSystemId: path[index],
      destSubgraphSystemId,
    })),
  });
}

function manualEdit(
  usecase: UseCase,
  changeId: number,
): ActiveManualUsecaseEdit {
  return {
    changeId,
    operation: CHANGE_OPERATION.Update,
    usecase,
    referencedComponents: {
      sgSystemIds: usecase.subgraphSystemIds,
      dataLinkSystemIds: [],
      controlLinkSystemIds: [],
    },
  };
}

describe('RoutingIssueFactory same-GKV groups', () => {
  const service = new SameGkvCollisionService();

  it('emits one SELECT option per new alternative plus MERGE_ALL', () => {
    const group = service.createGroup({
      gkvValueSystemIds: [100],
      candidates: [
        candidate([1, 2]),
        candidate([3, 4]),
        candidate([5, 6]),
        candidate([7, 8]),
      ],
      existingUsecase: null,
      manualOverrides: [],
    });

    const issue = RoutingIssueFactory.sameGkvChoiceRequired(
      group,
      routingSelection,
    );

    expect(issue.fixOptions).toHaveLength(5);
    expect(
      issue.fixOptions?.filter(
        option => option.commandPayload.mode === 'SELECT_CANDIDATE',
      ),
    ).toHaveLength(4);
    expect(issue.fixOptions?.at(-1)?.commandPayload.mode).toBe('MERGE_ALL');
  });

  it('adds KEEP_EXISTING when the group contains an existing UC', () => {
    const group = service.createGroup({
      gkvValueSystemIds: [100],
      candidates: [candidate([1, 2]), candidate([3, 4])],
      existingUsecase: existing([9, 10], 55),
      manualOverrides: [],
    });

    const issue = RoutingIssueFactory.sameGkvChoiceRequired(
      group,
      routingSelection,
    );

    expect(issue.fixOptions?.map(option => option.commandPayload.mode)).toEqual(
      expect.arrayContaining([
        'SELECT_CANDIDATE',
        'KEEP_EXISTING',
        'MERGE_ALL',
      ]),
    );
  });

  it('reports multiple MANUAL overrides as one blocking integrity issue', () => {
    const first = manualEdit(existing([1, 2], 61), 11);
    const second = manualEdit(existing([3, 4], 62), 12);

    const issue = RoutingIssueFactory.multipleManualGkvOverrides([
      first,
      second,
    ]);

    expect(issue).toEqual(
      expect.objectContaining({
        code: 'ARC-ROUTING-MULTIPLE-MANUAL-GKV-OVERRIDES',
        impactedUsecases: [61, 62],
      }),
    );
    expect(issue.fixOptions).toBeUndefined();
    expect(issue.message).toContain('changeIds: [11, 12]');
  });

  it('manualGkvConflict includes canonical requested member and directed-pair IDs', () => {
    const manualCandidate: ManualUsecaseCandidate = {
      kind: USECASE_CANDIDATE_KIND.Manual,
      memberSubgraphSystemIds: [20, 10],
      topology: {
        pairs: [
          {
            pair: {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
            dataLinks: [],
            controlLinks: [],
          },
        ],
      },
      sgkvAssignment: new Map(),
      gkv: [{keyDefSystemId: 1001, valueDefSystemId: 100}],
    };

    const issue = RoutingIssueFactory.manualGkvConflict(
      [100],
      [5, 3],
      manualCandidate,
    );

    expect(issue.code).toBe('ARC-ROUTING-MANUAL-GKV-CONFLICT');
    expect(issue.severity).toBe('ERROR');
    expect(issue.message).toContain('members: [10, 20]');
    expect(issue.message).toContain('pairs: [10->20]');
    expect(issue.impactedUsecases).toEqual([3, 5]);
  });
});
