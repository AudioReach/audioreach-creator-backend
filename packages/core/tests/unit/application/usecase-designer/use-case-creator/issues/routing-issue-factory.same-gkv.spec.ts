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
import {USECASE_TYPE} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase-type.js';

const routingSelection = {
  selectedUsecaseSystemIds: [],
  activeSubgraphs: [],
  excludedSubgraphSystemIds: [],
  excludedDataLinkSystemIds: [],
  excludedControlLinkSystemIds: [],
};

function candidate(
  path: number[],
  controlLinkPairs: AutoUsecaseCandidate['controlLinkPairs'] = [],
): AutoUsecaseCandidate {
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
    controlLinkPairs,
  };
}

function existing(path: number[], systemId: number): UseCase {
  return new UseCase({
    type: USECASE_TYPE.Linked,
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

  it('names the existing UC as impacted and on every fix option', () => {
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

    const existingUsecase = {entityType: 'UseCase', systemId: 55};
    expect(issue.impactedUsecases).toEqual([existingUsecase]);
    expect(issue.relatedEntities).toEqual({
      gkvValues: [{entityType: 'ValueDefinition', systemId: 100}],
    });
    expect(issue.params).toEqual({collisionId: group.collisionId});
    expect(
      issue.fixOptions?.map(option => ({
        kind: option.kind,
        usecase: option.relatedEntities.usecase,
        subgraphIds: option.relatedEntities.subgraphs.map(
          subgraph => subgraph.systemId,
        ),
        params: option.params,
      })),
    ).toEqual([
      // The candidates are numbered in alternative order, not input order.
      {
        kind: 'SELECT_CANDIDATE',
        usecase: existingUsecase,
        subgraphIds: expect.any(Array),
        params: {candidateNumber: 1},
      },
      {
        kind: 'SELECT_CANDIDATE',
        usecase: existingUsecase,
        subgraphIds: expect.any(Array),
        params: {candidateNumber: 2},
      },
      {
        kind: 'KEEP_EXISTING',
        usecase: existingUsecase,
        subgraphIds: [9, 10],
        params: undefined,
      },
      {
        kind: 'MERGE_ALL',
        usecase: existingUsecase,
        subgraphIds: [1, 2, 3, 4, 9, 10],
        params: undefined,
      },
    ]);
    expect(
      issue.fixOptions
        ?.filter(option => option.kind === 'SELECT_CANDIDATE')
        .map(option =>
          option.relatedEntities.subgraphs.map(subgraph => subgraph.systemId),
        ),
    ).toEqual(
      expect.arrayContaining([
        [1, 2],
        [3, 4],
      ]),
    );
  });

  it('names no UC when the group has no existing UC', () => {
    const group = service.createGroup({
      gkvValueSystemIds: [100],
      candidates: [candidate([1, 2]), candidate([3, 4])],
      existingUsecase: null,
      manualOverrides: [],
    });

    const issue = RoutingIssueFactory.sameGkvChoiceRequired(
      group,
      routingSelection,
    );

    expect(issue.impactedUsecases).toBeUndefined();
    expect(
      issue.fixOptions?.map(option => option.relatedEntities.usecase),
    ).toEqual([undefined, undefined, undefined]);
  });

  it('reports multiple MANUAL overrides as one blocking integrity issue', () => {
    const first = manualEdit(existing([1, 2], 61), 11);
    const second = manualEdit(existing([3, 4], 62), 12);

    const issue = RoutingIssueFactory.multipleManualGkvOverrides(
      [100],
      [first, second],
    );

    expect(issue).toEqual(
      expect.objectContaining({
        code: 'ARC-ROUTING-MULTIPLE-MANUAL-GKV-OVERRIDES',
        impactedUsecases: [
          {entityType: 'UseCase', systemId: 61},
          {entityType: 'UseCase', systemId: 62},
        ],
        relatedEntities: {
          gkvValues: [{entityType: 'ValueDefinition', systemId: 100}],
        },
      }),
    );
    expect(issue.fixOptions).toBeUndefined();
  });

  it('manualGkvConflict names the requested members and the owners in order', () => {
    const manualCandidate: ManualUsecaseCandidate = {
      kind: USECASE_CANDIDATE_KIND.Manual,
      memberSubgraphSystemIds: [20, 10],
      topology: {
        pairs: [
          {
            pair: {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
            dataLinks: [{systemId: 1}] as never,
            controlLinks: [],
          },
        ],
      },
      sgkvAssignment: new Map(),
      gkv: [{keyDefSystemId: 1001, valueDefSystemId: 100}],
      controlLinkPairs: [],
    };

    const issue = RoutingIssueFactory.manualGkvConflict(
      [100],
      [5, 3],
      manualCandidate,
    );

    expect(issue.code).toBe('ARC-ROUTING-MANUAL-GKV-CONFLICT');
    expect(issue.severity).toBe('ERROR');
    expect(issue.relatedEntities.subgraphs).toEqual([
      {entityType: 'Subgraph', systemId: 10},
      {entityType: 'Subgraph', systemId: 20},
    ]);
    expect(issue.impactedUsecases).toEqual([
      {entityType: 'UseCase', systemId: 3},
      {entityType: 'UseCase', systemId: 5},
    ]);
  });

  it('includes control-link pairs in collision alternative details', () => {
    const group = service.createGroup({
      gkvValueSystemIds: [100],
      candidates: [
        candidate(
          [10, 20, 30, 40],
          [{sourceSubgraphSystemId: 20, destSubgraphSystemId: 40}],
        ),
      ],
      existingUsecase: null,
      manualOverrides: [],
    });

    const issue = RoutingIssueFactory.sameGkvChoiceRequired(
      group,
      routingSelection,
    );

    expect(issue.fixOptions?.[0]?.commandPayload.collisionAlternatives).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'NEW',
          subgraphPairs: expect.arrayContaining([
            {sourceSubgraphSystemId: 20, destSubgraphSystemId: 40},
          ]),
        }),
      ]),
    );
  });
});
