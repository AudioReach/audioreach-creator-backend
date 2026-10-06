/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import type {KvPair} from '../../../../../../../src/application/ports/persistence/repositories/shared/kv-pair.js';
import type {ActiveManualUsecaseEdit} from '../../../../../../../src/application/ports/persistence/repositories/usecase/usecase.repository.js';
import {CHANGE_OPERATION} from '../../../../../../../src/application/shared/change-vocabulary.js';
import {
  USECASE_CANDIDATE_KIND,
  type AutoUsecaseCandidate,
} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import {SameGkvCollisionService} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/classification/same-gkv-collision.service.js';
import {UseCase} from '../../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';

function candidate(path: number[], values = [100]): AutoUsecaseCandidate {
  const gkv: KvPair[] = values.map(valueSystemId => ({
    keyDefSystemId: valueSystemId + 1000,
    valueDefSystemId: valueSystemId,
  }));
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
        {keyValues: index === 0 ? gkv : []},
      ]),
    ),
    gkv,
  };
}

function existing(path: number[], values = [100], systemId = 55): UseCase {
  return new UseCase({
    systemId,
    fileSystemId: 1,
    subgraphSystemIds: path,
    subgraphPairs: path.slice(1).map((destSubgraphSystemId, index) => ({
      sourceSubgraphSystemId: path[index],
      destSubgraphSystemId,
    })),
    keyVector: {valueSystemIds: values},
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

describe('SameGkvCollisionService', () => {
  const service = new SameGkvCollisionService();

  it('builds one group for four candidates sharing one GKV', () => {
    const groups = service.buildGroups(
      [
        candidate([1, 2]),
        candidate([3, 4]),
        candidate([5, 6]),
        candidate([7, 8]),
      ],
      [],
      [],
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.alternatives).toHaveLength(4);
  });

  it('deduplicates identical candidate topologies', () => {
    const groups = service.buildGroups(
      [candidate([1, 2]), candidate([1, 2]), candidate([3, 4])],
      [],
      [],
    );

    expect(groups[0]?.alternatives).toHaveLength(2);
  });

  it('keeps group and alternative IDs stable when discovery order changes', () => {
    const forward = service.buildGroups(
      [candidate([1, 2]), candidate([3, 4]), candidate([5, 6])],
      [],
      [],
    )[0];
    const reverse = service.buildGroups(
      [candidate([5, 6]), candidate([3, 4]), candidate([1, 2])],
      [],
      [],
    )[0];

    expect(forward?.collisionId).toBe(reverse?.collisionId);
    expect(forward?.alternatives.map(item => item.alternativeId)).toEqual(
      reverse?.alternatives.map(item => item.alternativeId),
    );
  });

  it('builds one group per canonical GKV', () => {
    const groups = service.buildGroups(
      [
        candidate([1, 2], [100]),
        candidate([3, 4], [100]),
        candidate([5, 6], [200]),
        candidate([7, 8], [200]),
      ],
      [],
      [],
    );

    expect(groups).toHaveLength(2);
    expect(groups.map(group => group.gkvValueSystemIds)).toEqual([
      [100],
      [200],
    ]);
  });

  it('attaches one existing UC and collapses an identical candidate topology', () => {
    const committed = existing([1, 2]);
    const groups = service.buildGroups(
      [candidate([1, 2]), candidate([3, 4])],
      [committed],
      [],
    );

    expect(groups[0]?.alternatives).toHaveLength(2);
    expect(groups[0]?.alternatives).toEqual(
      expect.arrayContaining([
        expect.objectContaining({kind: 'EXISTING', usecase: committed}),
        expect.objectContaining({kind: 'NEW'}),
      ]),
    );
  });

  it('retains multiple MANUAL overrides without automatic candidates', () => {
    const first = manualEdit(existing([1, 2], [100], 61), 11);
    const second = manualEdit(existing([3, 4], [100], 62), 12);

    const buckets = service.buildBuckets([], [], [first, second]);

    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.manualOverrides).toEqual([first, second]);
  });
});
