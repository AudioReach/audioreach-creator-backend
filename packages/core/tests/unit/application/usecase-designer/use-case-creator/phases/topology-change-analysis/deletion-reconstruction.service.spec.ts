/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {UseCase} from '../../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import {
  createAutoRoutingInput,
  createManualRoutingInput,
  emptyGraphEdits,
  ROUTING_MODE,
} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import type {RoutingInput} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {
  USECASE_TOPOLOGY_DECISION_KIND,
  type DeleteOrReconstructDecision,
  type UsecaseTopologyDecision,
} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import type {TopologyImpactInventory} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/topology-change-analysis/topology-impact-inventory.js';
import {DeletionReconstructionService} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/topology-change-analysis/deletion-reconstruction.service.js';
import type {SubgraphRepository} from '../../../../../../../src/application/ports/persistence/repositories/subgraph/subgraph.repository.js';
import type {DataLink} from '../../../../../../../src/domain/entities/usecase-data/links/data-link.js';
import {DATA_LINK_TYPE} from '../../../../../../../src/domain/entities/usecase-data/links/data-link-type.js';

function usecase(
  systemId: number,
  subgraphSystemIds: readonly number[],
  subgraphPairs: readonly [number, number][],
  type: 'EC' | 'LINKED' = 'LINKED',
): UseCase {
  return new UseCase({
    systemId,
    fileSystemId: 1,
    keyVector: {valueSystemIds: []},
    subgraphSystemIds: [...subgraphSystemIds],
    subgraphPairs: subgraphPairs.map(
      ([sourceSubgraphSystemId, destSubgraphSystemId]) => ({
        sourceSubgraphSystemId,
        destSubgraphSystemId,
      }),
    ),
    type,
  });
}

function dataLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
  isEc = false,
): DataLink {
  return {
    systemId,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
    linkType: isEc ? DATA_LINK_TYPE.Ec : DATA_LINK_TYPE.Normal,
    isEc,
  } as DataLink;
}

function input(
  mode: typeof ROUTING_MODE.Auto | typeof ROUTING_MODE.Manual,
  usecases: readonly UseCase[],
  subgraphIds: readonly number[],
  links: readonly DataLink[],
  requestedSgkvs: Readonly<Record<number, readonly (readonly number[])[]>> = {},
): RoutingInput {
  const init = {
    fileSystemId: 1,
    selection: {
      selectedUsecaseSystemIds: usecases.map(current => current.systemId),
      activeSubgraphs: subgraphIds.map(systemId => ({
        systemId,
        sgkvs: requestedSgkvs[systemId] ?? [],
      })),
      excludedSubgraphSystemIds: [],
      excludedDataLinkSystemIds: [],
      excludedControlLinkSystemIds: [],
    },
    selectedUsecases: [...usecases],
    graphSnapshot: {
      subgraphs: subgraphIds.map(systemId => ({
        subgraph: {systemId} as never,
        requestedSgkvs: requestedSgkvs[systemId] ?? [],
        isMdf: false,
      })),
      routableDataLinks: [...links],
      routableControlLinks: [],
      overlayDataLinks: [...links],
      overlayControlLinks: [],
      committedUsecases: [...usecases],
      sessionEdits: emptyGraphEdits(),
    },
    activeManualUsecaseEdits: [],
  };
  return mode === ROUTING_MODE.Auto
    ? createAutoRoutingInput(init)
    : createManualRoutingInput({...init, manualTopology: {pairs: []}});
}

function inventory(
  edges: ReadonlyMap<
    number,
    readonly {destSubgraphSystemId: number; isEc: boolean}[]
  >,
  inputValue: RoutingInput,
): TopologyImpactInventory {
  return {
    committedUsecasesByDirectedPair: new Map(),
    committedUsecasesBySubgraph: new Map(),
    deletedDataLinks: [],
    deletedControlLinks: [],
    deletedSubgraphSystemIds: new Set(),
    survivingDataLinkPairKeys: new Set(),
    survivingControlLinkPairKeys: new Set(),
    routableAdjacency: edges,
    routingSubgraphsById: new Map(
      inputValue.graphSnapshot.subgraphs.map(
        item => [item.subgraph.systemId, item] as const,
      ),
    ),
  };
}

function deleteDecision(currentUsecase: UseCase): DeleteOrReconstructDecision {
  return {
    kind: USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
    usecase: currentUsecase,
    deletedComponent: {type: 'DATA_LINK', systemId: 900},
    reconstructionPaths: [],
  };
}

describe('DeletionReconstructionService', () => {
  it('returns sorted reconstruction paths only for DELETE_OR_RECONSTRUCT decisions', async () => {
    const preservedUsecase = usecase(100, [1, 2], [[1, 2]]);
    const deletedUsecase = usecase(200, [10, 30], [[10, 30]]);
    const routingInput = input(
      ROUTING_MODE.Auto,
      [preservedUsecase, deletedUsecase],
      [1, 2, 10, 20, 30],
      [dataLink(1, 10, 20), dataLink(2, 20, 30)],
    );
    const decisions: readonly UsecaseTopologyDecision[] = [
      {
        kind: USECASE_TOPOLOGY_DECISION_KIND.Preserve,
        usecase: preservedUsecase,
        droppedSubgraphSystemIds: [],
      },
      deleteDecision(deletedUsecase),
    ];
    const result = await new DeletionReconstructionService().run(
      {
        input: routingInput,
        inventory: inventory(
          new Map([
            [10, [{destSubgraphSystemId: 20, isEc: false}]],
            [20, [{destSubgraphSystemId: 30, isEc: false}]],
          ]),
          routingInput,
        ),
        decisions,
      },
      {getSgkvs: jest.fn()} as unknown as SubgraphRepository,
    );

    expect(result.kind).toBe('OK');
    if (result.kind === 'OK') {
      expect(result.data[0]).toBe(decisions[0]);
      expect(result.data[1]).toMatchObject({
        kind: USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
        reconstructionPaths: [
          {
            subgraphSystemIds: [10, 20, 30],
            termination: 'NATURAL_LEAF',
            ecBoundaryLinkId: null,
          },
        ],
      });
    }
  });

  it('does not reconstruct ordinary deletion decisions in manual mode', async () => {
    const currentUsecase = usecase(200, [10, 30], [[10, 30]]);
    const routingInput = input(
      ROUTING_MODE.Manual,
      [currentUsecase],
      [10, 20, 30],
      [dataLink(1, 10, 20), dataLink(2, 20, 30)],
    );
    const decision = deleteDecision(currentUsecase);
    const result = await new DeletionReconstructionService().run(
      {
        input: routingInput,
        inventory: inventory(
          new Map([[10, [{destSubgraphSystemId: 20, isEc: false}]]]),
          routingInput,
        ),
        decisions: [decision],
      },
      {getSgkvs: jest.fn()} as unknown as SubgraphRepository,
    );

    expect(result).toEqual({kind: 'OK', data: [decision]});
  });

  it('performs the legacy EC SGKV lookup only when an EC boundary requires it', async () => {
    const currentUsecase = usecase(
      200,
      [1, 2, 3, 4],
      [
        [1, 2],
        [2, 3],
        [3, 4],
      ],
      'EC',
    );
    const links = [
      dataLink(1, 1, 5),
      dataLink(2, 5, 2),
      dataLink(3, 2, 3, true),
      dataLink(4, 3, 4),
    ];
    const routingInput = input(
      ROUTING_MODE.Auto,
      [currentUsecase],
      [1, 2, 3, 4, 5],
      links,
      {2: [[10]], 3: [[20]]},
    );
    const getSgkvs = jest.fn(async () => [
      {
        sgSystemId: 2,
        sgkvSystemId: 2,
        keyValues: [{keyDefSystemId: 1, valueDefSystemId: 10}],
      },
      {
        sgSystemId: 3,
        sgkvSystemId: 3,
        keyValues: [{keyDefSystemId: 1, valueDefSystemId: 20}],
      },
    ]);
    const result = await new DeletionReconstructionService().run(
      {
        input: routingInput,
        inventory: inventory(
          new Map([
            [1, [{destSubgraphSystemId: 5, isEc: false}]],
            [5, [{destSubgraphSystemId: 2, isEc: false}]],
            [2, [{destSubgraphSystemId: 3, isEc: true}]],
            [3, [{destSubgraphSystemId: 4, isEc: false}]],
          ]),
          routingInput,
        ),
        decisions: [deleteDecision(currentUsecase)],
      },
      {getSgkvs} as unknown as SubgraphRepository,
    );

    expect(result.kind).toBe('OK');
    expect(getSgkvs).toHaveBeenCalledWith(1, [2, 3]);
  });
});
