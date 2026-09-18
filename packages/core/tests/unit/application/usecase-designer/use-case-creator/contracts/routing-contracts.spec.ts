/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {UseCase} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import {Subgraph} from '../../../../../../src/domain/entities/usecase-data/subgraph/subgraph.js';
import type {ControlLink} from '../../../../../../src/domain/entities/usecase-data/links/control-link.js';
import {RoutingIssueFactory} from '../../../../../../src/application/usecase-designer/use-case-creator/issues/routing-issue-factory.js';
import {
  SOURCE,
  CHANGE_OPERATION,
} from '../../../../../../src/application/shared/change-vocabulary.js';
import {RoutingContext} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';
import {
  createAutoRoutingInput,
  createControlLinkManualTopologyPair,
  createManualRoutingInput,
  deriveRoutingScope,
  emptyGraphEdits,
  type RoutingGraphSnapshot,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {
  SEED_REASON,
  type Cones,
  type KvResolutions,
  type Seeds,
  type SgkvInstance,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
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

function createSubgraph(systemId: number): Subgraph {
  return new Subgraph({
    systemId,
    subgraphId: systemId + 100,
    name: `sg-${systemId}`,
    isImported: false,
    fileSystemId: 1,
  });
}

function createSnapshot(subgraph = createSubgraph(31)): RoutingGraphSnapshot {
  return {
    subgraphs: [{subgraph, requestedSgkvs: [[11]], isMdf: false}],
    routableDataLinks: [],
    routableControlLinks: [],
    overlayDataLinks: [],
    overlayControlLinks: [],
    committedUsecases: [],
    sessionEdits: emptyGraphEdits(),
  };
}

function createInput() {
  return createManualRoutingInput({
    fileSystemId: 1,
    selectedUsecases: [createUsecase(21, [31])],
    requestPolicy: {
      requestedSubgraphSystemIds: new Set([31]),
      explicitlyExcludedSubgraphSystemIds: new Set(),
      explicitlyExcludedDataLinkSystemIds: new Set(),
      explicitlyExcludedControlLinkSystemIds: new Set(),
    },
    graphSnapshot: createSnapshot(),
    manualTopology: {pairs: []},
  });
}

describe('routing contracts', () => {
  it('copies request policy, snapshot collections, and nested requested SGKVs', () => {
    const sourceSgkvs = [[11], [12, 13]];
    const selectedUsecases = [createUsecase(21, [31])];
    const requested = new Set([31]);
    const excluded = new Set<number>();
    const subgraph = createSubgraph(31);
    const snapshot: RoutingGraphSnapshot = {
      ...createSnapshot(subgraph),
      subgraphs: [{subgraph, requestedSgkvs: sourceSgkvs, isMdf: false}],
    };
    const input = createManualRoutingInput({
      fileSystemId: 1,
      selectedUsecases,
      requestPolicy: {
        requestedSubgraphSystemIds: requested,
        explicitlyExcludedSubgraphSystemIds: excluded,
        explicitlyExcludedDataLinkSystemIds: new Set([101]),
        explicitlyExcludedControlLinkSystemIds: new Set([201]),
      },
      graphSnapshot: snapshot,
      manualTopology: {pairs: []},
    });
    sourceSgkvs[0]!.push(99);
    selectedUsecases.push(createUsecase(22, [32]));
    requested.add(32);
    excluded.add(31);
    expect(input.graphSnapshot.subgraphs[0]!.subgraph).toBe(subgraph);
    expect(input.graphSnapshot.subgraphs[0]!.requestedSgkvs).toEqual([
      [11],
      [12, 13],
    ]);
    expect(input.selectedUsecases).toHaveLength(1);
    expect(input.requestPolicy.requestedSubgraphSystemIds).toEqual(
      new Set([31]),
    );
    expect(input.requestPolicy.explicitlyExcludedSubgraphSystemIds).toEqual(
      new Set(),
    );
  });

  it('keeps automatic inputs free of manual topology and manual inputs require topology', () => {
    const auto = createAutoRoutingInput({
      fileSystemId: 1,
      selectedUsecases: [],
      requestPolicy: {
        requestedSubgraphSystemIds: new Set(),
        explicitlyExcludedSubgraphSystemIds: new Set(),
        explicitlyExcludedDataLinkSystemIds: new Set(),
        explicitlyExcludedControlLinkSystemIds: new Set(),
      },
      graphSnapshot: createSnapshot(),
    });
    expect(auto).not.toHaveProperty('manualTopology');
    expect(createInput().manualTopology).toEqual({pairs: []});
  });

  it('uses grouped content-only Phase 4-6 outputs', () => {
    const instance: SgkvInstance = {
      keyValues: [{keyDefSystemId: 11, valueDefSystemId: 12}],
    };
    const kvResolutions: KvResolutions = {
      perSg: new Map([[31, [instance]]]),
      ucFilteredBaseline: new Map([[31, [instance]]]),
    };
    const seeds: Seeds = {
      sgSystemIds: new Set([31]),
      reasons: new Map([[31, SEED_REASON.KvChanged]]),
    };
    const cones: Cones = {
      sgSystemIds: new Set([31]),
      rootSgs: new Set([31]),
    };
    const context = new RoutingContext(createInput());

    expect(instance).not.toHaveProperty('sgkvSystemId');
    expect(kvResolutions.perSg.get(31)).toEqual([instance]);
    expect(seeds.reasons.get(31)).toBe('KV_CHANGED');
    expect(cones.rootSgs).toEqual(new Set([31]));
    expect(context.kvResolutions).toBeNull();
    expect(context.seeds).toBeNull();
    expect(context.cones).toBeNull();
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
      RoutingIssueFactory.selectedScopeIncomplete(
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

  it('preserves session edits in the snapshot and keeps request policy separate', () => {
    const deletedSubgraph = createSubgraph(20);
    const sessionEdits = {
      ...emptyGraphEdits(),
      deletedSgs: [deletedSubgraph],
    };
    const input = createManualRoutingInput({
      ...createInput(),
      requestPolicy: {
        ...createInput().requestPolicy,
        requestedSubgraphSystemIds: new Set([10, 20]),
        explicitlyExcludedSubgraphSystemIds: new Set([20]),
      },
      graphSnapshot: {
        ...createSnapshot(),
        sessionEdits,
      },
      manualTopology: {pairs: []},
    });
    sessionEdits.deletedSgs.push(createSubgraph(30));
    const context = new RoutingContext(input);
    expect(input.graphSnapshot.sessionEdits.deletedSgs).toEqual([
      deletedSubgraph,
    ]);
    expect(
      context.input.requestPolicy.explicitlyExcludedSubgraphSystemIds,
    ).toEqual(new Set([20]));
    expect(Object.isFrozen(input.graphSnapshot.sessionEdits)).toBe(true);
    expect(Object.isFrozen(input.graphSnapshot.sessionEdits.deletedSgs)).toBe(
      true,
    );
    expect(context).not.toHaveProperty('allUcs');
    expect(context).not.toHaveProperty('effectiveExcludedSubgraphSystemIds');
  });

  it('preserves borrowed topology link identity and emits descriptors unchanged', async () => {
    const link = {
      systemId: 1,
      sourceSubgraphSystemId: 20,
      destSubgraphSystemId: 10,
    } as ControlLink;
    const pair = createControlLinkManualTopologyPair(
      {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
      [link],
    );
    expect(pair.controlLinks[0]).toBe(link);
    expect(pair.dataLinks).toEqual([]);
    expect(Object.isFrozen(pair)).toBe(true);
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
