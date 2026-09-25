/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import type {KvPair} from '../../../../../../src/application/ports/persistence/repositories/shared/kv-pair.js';
import type {UseCase} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import type {RoutingCombination} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import {COLLISION_RESOLUTION_MODE} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/same-gkv-collision.js';
import {SameGkvCollisionService} from '../../../../../../src/application/usecase-designer/use-case-creator/services/same-gkv-collision.service.js';
import {CHANGE_OPERATION} from '../../../../../../src/application/shared/change-vocabulary.js';

function candidate(
  path: number[],
  values = [100],
  emptyAssignmentSystemIds: readonly number[] = [],
): RoutingCombination {
  const gkv: KvPair[] = values.map(valueSystemId => ({
    keyDefSystemId: valueSystemId + 1000,
    valueDefSystemId: valueSystemId,
  }));
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
          keyValues: emptyAssignmentSystemIds.includes(systemId) ? [] : gkv,
        },
      ]),
    ),
    gkv,
  };
}

function existing(path: number[], values = [100]): UseCase {
  return {
    systemId: 55,
    subgraphSystemIds: path,
    subgraphPairs: path.slice(1).map((systemId, index) => ({
      sourceSubgraphSystemId: path[index],
      destSubgraphSystemId: systemId,
    })),
    keyVector: {valueSystemIds: values},
  } as UseCase;
}

describe('SameGkvCollisionService', () => {
  const service = new SameGkvCollisionService();

  it('T1-031 offers all choices for overlapping new candidates', () => {
    const collision = service.detect(candidate([1, 2]), candidate([2, 3]));

    expect(collision?.options).toEqual([
      COLLISION_RESOLUTION_MODE.PathA,
      COLLISION_RESOLUTION_MODE.PathB,
      COLLISION_RESOLUTION_MODE.Merge,
    ]);
  });

  it('T1-012 offers only path choices for disjoint new candidates', () => {
    const collision = service.detect(candidate([1, 2]), candidate([3, 4]));

    expect(collision?.options).toEqual([
      COLLISION_RESOLUTION_MODE.PathA,
      COLLISION_RESOLUTION_MODE.PathB,
    ]);
  });

  it('T1-032 offers merge choices for an overlapping existing collision', () => {
    const collision = service.detect(candidate([1, 2]), existing([2, 3]));

    expect(collision?.options).toEqual([
      COLLISION_RESOLUTION_MODE.KeepExisting,
      COLLISION_RESOLUTION_MODE.ReplaceWithNew,
      COLLISION_RESOLUTION_MODE.Merge,
    ]);
  });

  it('T1-030 offers keep-existing and replace-with-new for a disjoint existing collision', () => {
    const collision = service.detect(candidate([1, 2]), existing([3, 4]));

    expect(collision?.options).toEqual([
      COLLISION_RESOLUTION_MODE.KeepExisting,
      COLLISION_RESOLUTION_MODE.ReplaceWithNew,
    ]);
  });

  it('uses a stable UUID v5 and stable Path A/Path B operands independent of discovery order', () => {
    const first = service.detect(candidate([1, 2]), candidate([3, 4]));
    const second = service.detect(candidate([3, 4]), candidate([1, 2]));

    expect(first?.collisionId).toEqual(second?.collisionId);
    expect(first?.collisionId).toEqual(
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
    expect(
      first?.operands.map(operand =>
        operand.kind === 'NEW' ? operand.candidate.path.subgraphSystemIds : [],
      ),
    ).toEqual(
      second?.operands.map(operand =>
        operand.kind === 'NEW' ? operand.candidate.path.subgraphSystemIds : [],
      ),
    );
    expect(first?.operands[0]).toEqual(
      expect.objectContaining({
        kind: 'NEW',
        candidate: expect.objectContaining({
          path: expect.objectContaining({subgraphSystemIds: [1, 2]}),
        }),
      }),
    );
  });

  it('does not report exact or identity-preserving interior matches as collisions', () => {
    expect(service.detect(candidate([1, 3]), existing([1, 3]))).toBeNull();
    expect(
      service.detect(candidate([1, 2, 3], [100], [2]), existing([1, 3])),
    ).toBeNull();
  });

  it('recognizes a surviving MANUAL materialization by GKV, SG set, and pair set', () => {
    const collision = service.detect(candidate([1, 2]), candidate([2, 3]))!;
    const mergedUsecase = existing([1, 2, 3]);
    const edit = {
      changeId: 7,
      operation: CHANGE_OPERATION.Create,
      usecase: mergedUsecase,
      referencedComponents: {
        sgSystemIds: [1, 2, 3],
        dataLinkSystemIds: [],
        controlLinkSystemIds: [],
      },
    };

    expect(service.isResolutionRecognized(collision, [edit])).toBe(true);
  });

  it('does not treat KEEP_EXISTING as a persisted resolution marker', () => {
    const collision = service.detect(candidate([1, 2]), existing([3, 4]))!;

    expect(
      service.isResolutionRecognized(collision, [
        {
          changeId: 8,
          operation: CHANGE_OPERATION.Update,
          usecase: existing([3, 4]),
          referencedComponents: {
            sgSystemIds: [3, 4],
            dataLinkSystemIds: [],
            controlLinkSystemIds: [],
          },
        },
      ]),
    ).toBe(false);
  });
});
