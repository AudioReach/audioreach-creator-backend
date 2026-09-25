/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {SOURCE} from '../../../../../../src/application/shared/change-vocabulary.js';
import type {AutoRoutingInput} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import type {RoutingCombination} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import {
  COLLISION_RESOLUTION_MODE,
  type SameGkvCollision,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/same-gkv-collision.js';
import {SameGkvCollisionResolutionStager} from '../../../../../../src/application/usecase-designer/use-case-creator/services/same-gkv-collision-resolution-stager.js';
import {DATA_LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/data-link-type.js';
import {USECASE_TYPE} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase-type.js';

function candidate(
  path: number[],
  assignmentValues: ReadonlyMap<number, readonly number[]> = new Map([
    [path[0], [100]],
  ]),
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
          keyValues: (assignmentValues.get(systemId) ?? []).map(value => ({
            keyDefSystemId: 1,
            valueDefSystemId: value,
          })),
        },
      ]),
    ),
    gkv: [{keyDefSystemId: 1, valueDefSystemId: 100}],
  };
}

function input(routableDataLinks: readonly unknown[] = []): AutoRoutingInput {
  return {
    fileSystemId: 1,
    graphSnapshot: {
      routableDataLinks,
      overlayDataLinks: routableDataLinks,
      overlayControlLinks: [],
    },
  } as AutoRoutingInput;
}

function collision(
  left: RoutingCombination,
  right: RoutingCombination,
): SameGkvCollision {
  return {
    collisionId: '11111111-1111-4111-8111-111111111111',
    gkvValueSystemIds: [100],
    operands: [
      {kind: 'NEW', candidate: left},
      {kind: 'NEW', candidate: right},
    ],
    options: [COLLISION_RESOLUTION_MODE.PathA],
  };
}

describe('SameGkvCollisionResolutionStager', () => {
  it('classifies a staged collision create from its resulting pair set', async () => {
    const create = jest.fn(async () => ({systemId: 900, changeId: 901}));
    const uow = {getUsecaseRepository: () => ({create})};
    const idGeneration = {getNextId: jest.fn(async () => 900)};
    const stager = new SameGkvCollisionResolutionStager();

    await stager.stage(
      collision(candidate([10, 20]), candidate([30, 40])),
      COLLISION_RESOLUTION_MODE.PathA,
      input([
        {
          sourceSubgraphSystemId: 10,
          destSubgraphSystemId: 20,
          linkType: DATA_LINK_TYPE.Ec,
        },
      ]),
      uow as never,
      idGeneration as never,
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({type: USECASE_TYPE.Ec}),
      {source: SOURCE.Manual},
      expect.any(Object),
      [
        {subgraphSystemId: 10, valueDefinitionSystemIds: [100]},
        {subgraphSystemId: 20, valueDefinitionSystemIds: []},
      ],
    );
  });

  it('stores the selected path B SGKV additions on a collision create', async () => {
    const create = jest.fn(async () => ({systemId: 900, changeId: 901}));
    const uow = {getUsecaseRepository: () => ({create})};
    const stager = new SameGkvCollisionResolutionStager();

    await stager.stage(
      collision(candidate([10, 20]), candidate([30, 40])),
      COLLISION_RESOLUTION_MODE.PathB,
      input(),
      uow as never,
      {getNextId: jest.fn(async () => 900)} as never,
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({subgraphSystemIds: [30, 40]}),
      {source: SOURCE.Manual},
      expect.any(Object),
      [
        {subgraphSystemId: 30, valueDefinitionSystemIds: [100]},
        {subgraphSystemId: 40, valueDefinitionSystemIds: []},
      ],
    );
  });

  it('deduplicates identical SGKV additions when merging new candidates', async () => {
    const create = jest.fn(async () => ({systemId: 900, changeId: 901}));
    const uow = {getUsecaseRepository: () => ({create})};
    const mergedCollision = collision(
      candidate([10, 20], new Map([[20, [100]]])),
      candidate([20, 30], new Map([[20, [100]]])),
    );

    await new SameGkvCollisionResolutionStager().stage(
      mergedCollision,
      COLLISION_RESOLUTION_MODE.Merge,
      input(),
      uow as never,
      {getNextId: jest.fn(async () => 900)} as never,
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        keyVector: {valueSystemIds: [100]},
        subgraphSystemIds: [10, 20, 30],
      }),
      {source: SOURCE.Manual},
      expect.any(Object),
      [
        {subgraphSystemId: 10, valueDefinitionSystemIds: []},
        {subgraphSystemId: 20, valueDefinitionSystemIds: [100]},
        {subgraphSystemId: 30, valueDefinitionSystemIds: []},
      ],
    );
  });

  it('preserves distinct SGKV additions for the same merged subgraph', async () => {
    const create = jest.fn(async () => ({systemId: 900, changeId: 901}));
    const uow = {getUsecaseRepository: () => ({create})};
    const mergedCollision = collision(
      candidate([10, 20]),
      candidate([20, 30], new Map([[20, [100]]])),
    );

    await new SameGkvCollisionResolutionStager().stage(
      mergedCollision,
      COLLISION_RESOLUTION_MODE.Merge,
      input(),
      uow as never,
      {getNextId: jest.fn(async () => 900)} as never,
    );

    expect(create).toHaveBeenCalledWith(
      expect.any(Object),
      {source: SOURCE.Manual},
      expect.any(Object),
      [
        {subgraphSystemId: 10, valueDefinitionSystemIds: [100]},
        {subgraphSystemId: 20, valueDefinitionSystemIds: []},
        {subgraphSystemId: 20, valueDefinitionSystemIds: [100]},
        {subgraphSystemId: 30, valueDefinitionSystemIds: []},
      ],
    );
  });

  it('recomputes an existing UseCase type when a collision merge adds an EC pair', async () => {
    const applyStructuralChange = jest.fn(async () => ({
      systemId: 55,
      changeId: 56,
    }));
    const uow = {getUsecaseRepository: () => ({applyStructuralChange})};
    const idGeneration = {getNextId: jest.fn()};
    const stager = new SameGkvCollisionResolutionStager();
    const existing = {
      systemId: 55,
      fileSystemId: 1,
      keyVector: {valueSystemIds: [100]},
      subgraphSystemIds: [20, 30],
      subgraphPairs: [{sourceSubgraphSystemId: 20, destSubgraphSystemId: 30}],
    };
    const mergeCollision: SameGkvCollision = {
      collisionId: '11111111-1111-4111-8111-111111111111',
      gkvValueSystemIds: [100],
      operands: [
        {kind: 'NEW', candidate: candidate([10, 20])},
        {kind: 'EXISTING', usecase: existing as never},
      ],
      options: [COLLISION_RESOLUTION_MODE.Merge],
    };

    await stager.stage(
      mergeCollision,
      COLLISION_RESOLUTION_MODE.Merge,
      input([
        {
          sourceSubgraphSystemId: 10,
          destSubgraphSystemId: 20,
          linkType: DATA_LINK_TYPE.Ec,
        },
        {
          sourceSubgraphSystemId: 20,
          destSubgraphSystemId: 30,
          linkType: DATA_LINK_TYPE.Normal,
        },
      ]),
      uow as never,
      idGeneration as never,
    );

    expect(applyStructuralChange).toHaveBeenCalledWith(
      55,
      expect.objectContaining({newType: USECASE_TYPE.Ec}),
      {source: SOURCE.Manual},
      expect.any(Object),
      [
        {subgraphSystemId: 10, valueDefinitionSystemIds: [100]},
        {subgraphSystemId: 20, valueDefinitionSystemIds: []},
      ],
    );
  });

  it('stores new candidate SGKV additions when replacing an existing UseCase', async () => {
    const deleteUsecase = jest.fn(async () => ({systemId: 55, changeId: 56}));
    const create = jest.fn(async () => ({systemId: 900, changeId: 901}));
    const existing = {
      systemId: 55,
      fileSystemId: 1,
      keyVector: {valueSystemIds: [100]},
      subgraphSystemIds: [20, 30],
      subgraphPairs: [{sourceSubgraphSystemId: 20, destSubgraphSystemId: 30}],
    };
    const replaceCollision: SameGkvCollision = {
      collisionId: '11111111-1111-4111-8111-111111111111',
      gkvValueSystemIds: [100],
      operands: [
        {kind: 'NEW', candidate: candidate([10, 20])},
        {kind: 'EXISTING', usecase: existing as never},
      ],
      options: [COLLISION_RESOLUTION_MODE.ReplaceWithNew],
    };

    await new SameGkvCollisionResolutionStager().stage(
      replaceCollision,
      COLLISION_RESOLUTION_MODE.ReplaceWithNew,
      input(),
      {
        getUsecaseRepository: () => ({delete: deleteUsecase, create}),
      } as never,
      {getNextId: jest.fn(async () => 900)} as never,
    );

    expect(deleteUsecase).toHaveBeenCalledWith(55, {source: SOURCE.Manual});
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({systemId: 900}),
      {source: SOURCE.Manual},
      expect.any(Object),
      [
        {subgraphSystemId: 10, valueDefinitionSystemIds: [100]},
        {subgraphSystemId: 20, valueDefinitionSystemIds: []},
      ],
    );
  });

  it('does not write SGKV additions when keeping an existing UseCase', async () => {
    const getUsecaseRepository = jest.fn();

    await expect(
      new SameGkvCollisionResolutionStager().stage(
        {
          collisionId: '11111111-1111-4111-8111-111111111111',
          gkvValueSystemIds: [100],
          operands: [
            {kind: 'NEW', candidate: candidate([10, 20])},
            {
              kind: 'EXISTING',
              usecase: {
                systemId: 55,
                keyVector: {valueSystemIds: [100]},
              } as never,
            },
          ],
          options: [COLLISION_RESOLUTION_MODE.KeepExisting],
        },
        COLLISION_RESOLUTION_MODE.KeepExisting,
        input(),
        {getUsecaseRepository} as never,
        {getNextId: jest.fn()} as never,
      ),
    ).resolves.toEqual([]);
    expect(getUsecaseRepository).not.toHaveBeenCalled();
  });

  it('rejects a candidate whose SGKV additions do not aggregate to its GKV', async () => {
    const invalid = candidate([10], new Map([[10, [200]]]));

    await expect(
      new SameGkvCollisionResolutionStager().stage(
        collision(invalid, candidate([20])),
        COLLISION_RESOLUTION_MODE.PathA,
        input(),
        {getUsecaseRepository: jest.fn()} as never,
        {getNextId: jest.fn()} as never,
      ),
    ).rejects.toThrow('SGKV assignments do not match candidate GKV');
  });
});
