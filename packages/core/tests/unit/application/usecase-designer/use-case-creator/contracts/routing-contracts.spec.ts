/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {UseCase} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import {Subgraph} from '../../../../../../src/domain/entities/usecase-data/subgraph/subgraph.js';
import {IssueFactory} from '../../../../../../src/shared/issues/factories.js';
import {
  createManualRoutingInput,
  deriveRoutingScope,
  emptyGraphEdits,
  ROUTING_MODE,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {RoutingContext} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';

function createUsecase(systemId: number, subgraphSystemIds: number[]): UseCase {
  return new UseCase({
    systemId,
    fileSystemId: 1,
    keyVector: {valueSystemIds: []},
    subgraphSystemIds,
    subgraphPairs: [],
  });
}

describe('routing contracts', () => {
  it('copies selected snapshots and derived routing scope sets', () => {
    const sourceSgkvs = [[11], [12, 13]];
    const selectedUsecase = createUsecase(21, [31]);
    const selectedUsecases = [selectedUsecase];
    const selectedScopeSubgraphs = new Set([31]);
    const inputSubgraphs = new Set([31]);
    const outOfSelectionSubgraphs = new Set<number>();
    const effectiveRoutingScope = new Set([31]);

    const input = createManualRoutingInput({
      selectedUsecaseSystemIds: [21],
      selectedUsecases,
      activeSubgraphs: [{systemId: 31, sgkvs: sourceSgkvs}],
      selectedScopeSubgraphs,
      inputSubgraphs,
      outOfSelectionSubgraphs,
      effectiveRoutingScope,
      graphEdits: emptyGraphEdits(),
      manualTopology: {
        pairs: [],
        supportingDataLinkSystemIds: [],
        supportingControlLinkSystemIds: [],
        isolatedSubgraphSystemIds: [],
      },
    });
    sourceSgkvs[0].push(99);
    selectedUsecases.push(createUsecase(22, [32]));
    selectedScopeSubgraphs.add(32);
    inputSubgraphs.add(32);
    outOfSelectionSubgraphs.add(32);
    effectiveRoutingScope.add(32);

    expect(input.activeSubgraphs).toEqual([
      {systemId: 31, sgkvs: [[11], [12, 13]]},
    ]);
    expect(input.selectedUsecases).toEqual([selectedUsecase]);
    expect(input.selectedScopeSubgraphs).toEqual(new Set([31]));
    expect(input.inputSubgraphs).toEqual(new Set([31]));
    expect(input.outOfSelectionSubgraphs).toEqual(new Set());
    expect(input.effectiveRoutingScope).toEqual(new Set([31]));
    expect(input.excludedSubgraphSystemIds).toEqual([]);
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

  it('preserves deleted subgraph records in routing input for later phases', () => {
    const deletedSubgraph = new Subgraph({
      systemId: 20,
      subgraphId: 200,
      name: 'deleted-sg',
      isImported: false,
      fileSystemId: 1,
    });
    const graphEdits = {
      ...emptyGraphEdits(),
      deletedSgs: [deletedSubgraph],
    };

    const input = createManualRoutingInput({
      selectedUsecaseSystemIds: [],
      selectedUsecases: [],
      activeSubgraphs: [{systemId: 10, sgkvs: []}],
      selectedScopeSubgraphs: new Set(),
      inputSubgraphs: new Set([10, 20]),
      outOfSelectionSubgraphs: new Set([10, 20]),
      effectiveRoutingScope: new Set([10]),
      graphEdits,
      manualTopology: {
        pairs: [],
        supportingDataLinkSystemIds: [],
        supportingControlLinkSystemIds: [],
        isolatedSubgraphSystemIds: [10],
      },
    });

    expect(input.graphEdits.deletedSgs).toEqual([deletedSubgraph]);
    expect(input.activeSubgraphs).toEqual([{systemId: 10, sgkvs: []}]);
  });

  it('keeps immutable routing scope on the input and initializes mutable context state', () => {
    const input = createManualRoutingInput({
      selectedUsecaseSystemIds: [21],
      selectedUsecases: [createUsecase(21, [31])],
      activeSubgraphs: [{systemId: 31, sgkvs: []}],
      selectedScopeSubgraphs: new Set([31]),
      inputSubgraphs: new Set([31]),
      outOfSelectionSubgraphs: new Set(),
      effectiveRoutingScope: new Set([31]),
      graphEdits: emptyGraphEdits(),
      manualTopology: {
        pairs: [],
        supportingDataLinkSystemIds: [],
        supportingControlLinkSystemIds: [],
        isolatedSubgraphSystemIds: [],
      },
    });

    const context = new RoutingContext(input);
    expect(context).toEqual(
      expect.objectContaining({
        input,
        affectedUcSystemIds: new Set(),
        allUcs: [],
        combinations: [],
        emittedChanges: [],
        mdfSubgraphSystemIds: new Set(),
        warnings: [],
        response: null,
      }),
    );
    context.mdfSubgraphSystemIds.add(31);
    expect(context.mdfSubgraphSystemIds).toEqual(new Set([31]));
    expect(new RoutingContext(input)).not.toHaveProperty('selectedUsecases');
    expect(new RoutingContext(input)).not.toHaveProperty('mode');
    expect(new RoutingContext(input)).not.toHaveProperty('stagedChanges');
    expect(new RoutingContext(input)).not.toHaveProperty(
      'effectiveRoutingScope',
    );
  });
});
