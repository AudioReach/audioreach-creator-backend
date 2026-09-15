/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {UseCase} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import {Subgraph} from '../../../../../../src/domain/entities/usecase-data/subgraph/subgraph.js';
import {IssueFactory} from '../../../../../../src/shared/issues/factories.js';
import {
  SOURCE,
  CHANGE_OPERATION,
} from '../../../../../../src/application/shared/change-vocabulary.js';
import {RoutingContext} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';
import {
  createControlLinkManualTopologyPair,
  createManualRoutingInput,
  deriveRoutingScope,
  emptyGraphEdits,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {ResponseBuilder} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/response-builder.js';
import {GetUsecaseChangeDetailsQuery} from '../../../../../../src/application/usecase-designer/usecase/get-change-details/get-usecase-change-details.query.js';

function createUsecase(systemId: number, subgraphSystemIds: number[]): UseCase {
  return new UseCase({
    systemId,
    fileSystemId: 1,
    keyVector: {valueSystemIds: []},
    subgraphSystemIds,
    subgraphPairs: [],
  });
}

function createInput() {
  return createManualRoutingInput({
    selectedUsecases: [createUsecase(21, [31])],
    activeSubgraphs: [{systemId: 31, sgkvs: [[11], [12, 13]]}],
    scopePolicy: {
      requestedSubgraphSystemIds: new Set([31]),
      excludedSubgraphSystemIds: new Set(),
    },
    graphEdits: emptyGraphEdits(),
    manualTopology: {pairs: []},
  });
}

describe('routing contracts', () => {
  it('copies selected snapshots, scope policy, and pair-local topology', () => {
    const sourceSgkvs = [[11], [12, 13]];
    const selectedUsecases = [createUsecase(21, [31])];
    const requested = new Set([31]);
    const excluded = new Set<number>();
    const input = createManualRoutingInput({
      selectedUsecases,
      activeSubgraphs: [{systemId: 31, sgkvs: sourceSgkvs}],
      scopePolicy: {
        requestedSubgraphSystemIds: requested,
        excludedSubgraphSystemIds: excluded,
      },
      graphEdits: emptyGraphEdits(),
      manualTopology: {pairs: []},
    });
    sourceSgkvs[0].push(99);
    selectedUsecases.push(createUsecase(22, [32]));
    requested.add(32);
    excluded.add(31);
    expect(input.activeSubgraphs).toEqual([
      {systemId: 31, sgkvs: [[11], [12, 13]]},
    ]);
    expect(input.selectedUsecases).toHaveLength(1);
    expect(input.scopePolicy.requestedSubgraphSystemIds).toEqual(new Set([31]));
    expect(input.scopePolicy.excludedSubgraphSystemIds).toEqual(new Set());
  });

  it('derives selected and effective scope with request ordering preserved', () => {
    const scope = deriveRoutingScope(
      [createUsecase(21, [10, 20])],
      [
        {systemId: 10, sgkvs: []},
        {systemId: 30, sgkvs: []},
        {systemId: 20, sgkvs: []},
      ],
      [20],
    );
    expect(scope.selectedScopeSubgraphs).toEqual(new Set([10, 20]));
    expect(scope.inputSubgraphs).toEqual(new Set([10, 30, 20]));
    expect(scope.outOfSelectionSubgraphs).toEqual(new Set([30]));
    expect(scope.effectiveRoutingScope).toEqual(new Set([10, 30]));
    expect(scope.missingSelectedScopeSubgraphs).toEqual(new Set());
  });

  it('reports every selected-scope subgraph missing from the input', () => {
    const scope = deriveRoutingScope(
      [createUsecase(21, [10, 20, 30])],
      [{systemId: 10, sgkvs: []}],
      [30],
    );
    expect(scope.missingSelectedScopeSubgraphs).toEqual(new Set([20]));
    expect(
      IssueFactory.routingSelectedScopeIncomplete(
        scope.missingSelectedScopeSubgraphs,
      ),
    ).toEqual(
      expect.objectContaining({
        code: 'ARC-ROUTING-PREVAL-SCOPE-INCOMPLETE',
        message: expect.stringContaining('[20]'),
      }),
    );
  });

  it('does not require a selected-scope subgraph deleted in the current session', () => {
    const scope = deriveRoutingScope(
      [createUsecase(21, [10, 20])],
      [{systemId: 10, sgkvs: []}],
      [],
      [20],
    );
    expect(scope.missingSelectedScopeSubgraphs).toEqual(new Set());
    expect(scope.effectiveRoutingScope).toEqual(new Set([10]));
    expect(scope.effectiveActiveSubgraphs).toEqual([{systemId: 10, sgkvs: []}]);
  });

  it('removes excluded and deleted stale selections from routable input', () => {
    const scope = deriveRoutingScope(
      [createUsecase(21, [10])],
      [
        {systemId: 10, sgkvs: [[1]]},
        {systemId: 20, sgkvs: [[2]]},
        {systemId: 30, sgkvs: [[3]]},
      ],
      [30],
      [20],
    );

    expect(scope.inputSubgraphs).toEqual(new Set([10, 20, 30]));
    expect(scope.outOfSelectionSubgraphs).toEqual(new Set([20, 30]));
    expect(scope.effectiveRoutingScope).toEqual(new Set([10]));
    expect(scope.effectiveActiveSubgraphs).toEqual([
      {systemId: 10, sgkvs: [[1]]},
    ]);
  });

  it('preserves deleted graph records and keeps exclusions only on input', () => {
    const deletedSubgraph = new Subgraph({
      systemId: 20,
      subgraphId: 200,
      name: 'deleted-sg',
      isImported: false,
      fileSystemId: 1,
    });
    const input = createManualRoutingInput({
      ...createInput(),
      scopePolicy: {
        requestedSubgraphSystemIds: new Set([10, 20]),
        excludedSubgraphSystemIds: new Set([20]),
      },
      graphEdits: {...emptyGraphEdits(), deletedSgs: [deletedSubgraph]},
      manualTopology: {pairs: []},
    });
    const context = new RoutingContext(input);
    expect(input.graphEdits.deletedSgs).toEqual([deletedSubgraph]);
    expect(context.input.scopePolicy.excludedSubgraphSystemIds).toEqual(
      new Set([20]),
    );
    expect(context).not.toHaveProperty('excludedSubgraphSystemIds');
    expect(context).not.toHaveProperty('excludedDataLinkSystemIds');
    expect(context).not.toHaveProperty('excludedControlLinkSystemIds');
  });

  it('uses pair-local factories and emits descriptors unchanged in the response', async () => {
    const pair = createControlLinkManualTopologyPair(
      {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
      [
        {
          systemId: 1,
          sourceSubgraphSystemId: 20,
          destSubgraphSystemId: 10,
        } as never,
      ],
    );
    expect(pair.dataLinks).toEqual([]);
    expect(pair.controlLinks).toHaveLength(1);
    expect(Object.isFrozen(pair)).toBe(true);
    expect(Object.isFrozen(pair.pair)).toBe(true);
    expect(Object.isFrozen(pair.controlLinks)).toBe(true);
    const context = new RoutingContext(createInput());
    context.emittedUcChanges.push({
      systemId: 21,
      changeId: 7,
      operation: CHANGE_OPERATION.Create,
      source: SOURCE.AutoRouting,
    });
    await new ResponseBuilder().run(context, {
      getWriteContext: () => ({groupId: 'group-1'}),
    } as never);
    expect(context.routingOutcome?.emittedChanges).toEqual([
      {
        systemId: 21,
        changeId: 7,
        operation: CHANGE_OPERATION.Create,
        source: SOURCE.AutoRouting,
      },
    ]);
  });

  it('rejects duplicate emitted UseCase IDs in change-details queries', () => {
    const duplicate = {
      systemId: 21,
      changeId: 7,
      operation: CHANGE_OPERATION.Create,
      source: SOURCE.Manual,
    };
    expect(
      () =>
        new GetUsecaseChangeDetailsQuery('1', 'client-1', [
          duplicate,
          duplicate,
        ]),
    ).toThrow('Duplicate emitted usecase systemId: 21');
  });
});
