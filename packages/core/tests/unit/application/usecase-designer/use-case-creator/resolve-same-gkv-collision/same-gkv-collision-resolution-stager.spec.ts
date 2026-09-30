/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {SOURCE} from '../../../../../../src/application/shared/change-vocabulary.js';
import type {AutoRoutingInput} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import type {RoutingCombination} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import type {SameGkvCollisionGroup} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/same-gkv-collision.js';
import {SameGkvCollisionService} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/classification/same-gkv-collision.service.js';
import {SameGkvCollisionResolutionStager} from '../../../../../../src/application/usecase-designer/use-case-creator/resolve-same-gkv-collision/same-gkv-collision-resolution-stager.js';
import {DATA_LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/data-link-type.js';
import {UseCase} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
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

function existing(path: number[]): UseCase {
  return new UseCase({
    systemId: 55,
    fileSystemId: 1,
    keyVector: {valueSystemIds: [100]},
    subgraphSystemIds: path,
    subgraphPairs: path.slice(1).map((destSubgraphSystemId, index) => ({
      sourceSubgraphSystemId: path[index],
      destSubgraphSystemId,
    })),
  });
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

function collisionGroup(
  candidates: readonly RoutingCombination[],
  existingUsecase: UseCase | null = null,
): SameGkvCollisionGroup {
  return new SameGkvCollisionService().createGroup({
    gkvValueSystemIds: [100],
    candidates,
    existingUsecase,
    manualOverrides: [],
  });
}

function select(
  group: SameGkvCollisionGroup,
  candidateToSelect: RoutingCombination,
) {
  const alternative = group.alternatives.find(
    item => item.kind === 'NEW' && item.candidate === candidateToSelect,
  );
  if (!alternative) throw new Error('Candidate alternative not found');
  return {
    mode: 'SELECT_CANDIDATE' as const,
    collisionId: group.collisionId,
    alternativeId: alternative.alternativeId,
  };
}

describe('SameGkvCollisionResolutionStager', () => {
  it('creates only the candidate selected by alternative ID', async () => {
    const create = jest.fn(async () => ({systemId: 900, changeId: 901}));
    const first = candidate([10, 20]);
    const selected = candidate([30, 40]);
    const third = candidate([50, 60]);
    const group = collisionGroup([first, selected, third]);

    await new SameGkvCollisionResolutionStager().stage(
      group,
      select(group, selected),
      input(),
      {getUsecaseRepository: () => ({create})} as never,
      {getNextId: jest.fn(async () => 900)} as never,
    );

    expect(create).toHaveBeenCalledTimes(1);
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

  it('MERGE_ALL unions four disjoint alternatives without artificial pairs', async () => {
    const create = jest.fn(async () => ({systemId: 900, changeId: 901}));
    const group = collisionGroup([
      candidate([10, 20]),
      candidate([30, 40]),
      candidate([50, 60]),
      candidate([70, 80]),
    ]);

    await new SameGkvCollisionResolutionStager().stage(
      group,
      {mode: 'MERGE_ALL', collisionId: group.collisionId},
      input(),
      {getUsecaseRepository: () => ({create})} as never,
      {getNextId: jest.fn(async () => 900)} as never,
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        subgraphSystemIds: [10, 20, 30, 40, 50, 60, 70, 80],
        subgraphPairs: [
          {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
          {sourceSubgraphSystemId: 30, destSubgraphSystemId: 40},
          {sourceSubgraphSystemId: 50, destSubgraphSystemId: 60},
          {sourceSubgraphSystemId: 70, destSubgraphSystemId: 80},
        ],
      }),
      {source: SOURCE.Manual},
      expect.any(Object),
      expect.any(Array),
    );
  });

  it('unions SGKV values into one addition per merged subgraph', async () => {
    const create = jest.fn(async () => ({systemId: 900, changeId: 901}));
    const group = collisionGroup([
      candidate([10, 20]),
      candidate([20, 30], new Map([[20, [100]]])),
    ]);

    await new SameGkvCollisionResolutionStager().stage(
      group,
      {mode: 'MERGE_ALL', collisionId: group.collisionId},
      input(),
      {getUsecaseRepository: () => ({create})} as never,
      {getNextId: jest.fn(async () => 900)} as never,
    );

    expect(create).toHaveBeenCalledWith(
      expect.any(Object),
      {source: SOURCE.Manual},
      expect.any(Object),
      [
        {subgraphSystemId: 10, valueDefinitionSystemIds: [100]},
        {subgraphSystemId: 20, valueDefinitionSystemIds: [100]},
        {subgraphSystemId: 30, valueDefinitionSystemIds: []},
      ],
    );
  });

  it('updates existing identity and recomputes type for MERGE_ALL', async () => {
    const applyStructuralChange = jest.fn(async () => ({
      systemId: 55,
      changeId: 56,
    }));
    const committed = existing([20, 30]);
    const group = collisionGroup([candidate([10, 20])], committed);

    await new SameGkvCollisionResolutionStager().stage(
      group,
      {mode: 'MERGE_ALL', collisionId: group.collisionId},
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
      {getUsecaseRepository: () => ({applyStructuralChange})} as never,
      {getNextId: jest.fn()} as never,
    );

    expect(applyStructuralChange).toHaveBeenCalledWith(
      55,
      expect.objectContaining({
        addedSgSystemIds: [10],
        newType: USECASE_TYPE.Ec,
      }),
      {source: SOURCE.Manual},
      expect.any(Object),
      [
        {subgraphSystemId: 10, valueDefinitionSystemIds: [100]},
        {subgraphSystemId: 20, valueDefinitionSystemIds: []},
        {subgraphSystemId: 30, valueDefinitionSystemIds: []},
      ],
    );
  });

  it('deletes an existing UC before creating the selected candidate', async () => {
    const deleteUsecase = jest.fn(async () => ({systemId: 55, changeId: 56}));
    const create = jest.fn(async () => ({systemId: 900, changeId: 901}));
    const selected = candidate([10, 20]);
    const group = collisionGroup([selected], existing([30, 40]));

    await new SameGkvCollisionResolutionStager().stage(
      group,
      select(group, selected),
      input(),
      {
        getUsecaseRepository: () => ({delete: deleteUsecase, create}),
      } as never,
      {getNextId: jest.fn(async () => 900)} as never,
    );

    expect(deleteUsecase).toHaveBeenCalledWith(55, {source: SOURCE.Manual});
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('KEEP_EXISTING writes nothing', async () => {
    const getUsecaseRepository = jest.fn();
    const group = collisionGroup([candidate([10, 20])], existing([30, 40]));

    await expect(
      new SameGkvCollisionResolutionStager().stage(
        group,
        {mode: 'KEEP_EXISTING', collisionId: group.collisionId},
        input(),
        {getUsecaseRepository} as never,
        {getNextId: jest.fn()} as never,
      ),
    ).resolves.toEqual([]);
    expect(getUsecaseRepository).not.toHaveBeenCalled();
  });

  it('rejects a selected candidate whose SGKV additions do not match its GKV', async () => {
    const invalid = candidate([10], new Map([[10, [200]]]));
    const group = collisionGroup([invalid, candidate([20])]);

    await expect(
      new SameGkvCollisionResolutionStager().stage(
        group,
        select(group, invalid),
        input(),
        {getUsecaseRepository: jest.fn()} as never,
        {getNextId: jest.fn()} as never,
      ),
    ).rejects.toThrow('SGKV assignments do not match candidate GKV');
  });
});
