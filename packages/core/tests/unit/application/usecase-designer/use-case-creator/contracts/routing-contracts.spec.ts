/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {UseCase} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import {Subgraph} from '../../../../../../src/domain/entities/usecase-data/subgraph/subgraph.js';
import {DataLink} from '../../../../../../src/domain/entities/usecase-data/links/data-link.js';
import {RoutingIssueFactory} from '../../../../../../src/application/usecase-designer/use-case-creator/issues/routing-issue-factory.js';
import {ISSUE_ENTITY_TYPE} from '../../../../../../src/shared/issues/impacted-entity.js';
import {IssueSeverity} from '../../../../../../src/shared/issues/severity.js';
import {
  SOURCE,
  CHANGE_OPERATION,
} from '../../../../../../src/application/shared/change-vocabulary.js';
import {
  createAutoRoutingInput,
  createManualRoutingInput,
  emptyGraphEdits,
  type RoutingGraphSnapshot,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {assembleManualTopology} from '../../../../../../src/application/usecase-designer/use-case-creator/create-manual-usecases/manual-topology-assembler.js';
import type {
  ActiveSubgraphSelection,
  RoutingSelection,
} from '../../../../../../src/application/use-case-designer/use-case-creator/contracts/routing-input.js';
import type {ActiveManualUsecaseEdit} from '../../../../../../src/application/ports/persistence/repositories/usecase/usecase.repository.js';
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

function createDataLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): DataLink {
  return new DataLink({
    systemId,
    sourceNodeSystemId: systemId * 10 + 1,
    destinationNodeSystemId: systemId * 10 + 2,
    sourcePortSystemId: systemId * 10 + 3,
    destinationPortSystemId: systemId * 10 + 4,
    linkType: 'NORMAL' as never,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
    fileSystemId: 1,
  });
}

function createSnapshot(subgraph = createSubgraph(31)): RoutingGraphSnapshot {
  return {
    subgraphs: [{subgraph, requestedSgkvs: [[11]]}],
    mdf: {effective: new Set(), deleted: new Set()},
    routableDataLinks: [],
    routableControlLinks: [],
    overlayDataLinks: [],
    overlayControlLinks: [],
    committedUsecases: [],
    sessionEdits: emptyGraphEdits(),
    committedDataLinks: [],
  };
}

function createInput() {
  return createManualRoutingInput({
    fileSystemId: 1,
    selection: {
      selectedUsecaseSystemIds: [21],
      activeSubgraphs: [{systemId: 31, sgkvs: [[11]]}],
      includedDataLinkSystemIds: [],
      includedControlLinkSystemIds: [],
    },
    selectedUsecases: [createUsecase(21, [31])],
    graphSnapshot: createSnapshot(),
    manualTopology: {pairs: [], isolatedSubgraphSystemIds: []},
    activeManualUsecaseEdits: [],
  });
}

function createActiveManualUsecaseEdit(
  changeId: number,
): ActiveManualUsecaseEdit {
  return {
    changeId,
    operation: CHANGE_OPERATION.Create,
    usecase: createUsecase(changeId, [31]),
    referencedComponents: {
      sgSystemIds: [31],
      dataLinkSystemIds: [],
      controlLinkSystemIds: [],
    },
  };
}

describe('routing contracts', () => {
  it('creates the non-blocking C1 cycle warning', () => {
    const issue = RoutingIssueFactory.cycleDetected(17);

    expect(issue.code).toBe('ARC-ROUTING-CYCLE-DETECTED');
    expect(issue.severity).toBe(IssueSeverity.Warning);
    expect(issue.impactedEntity).toEqual({
      entityType: ISSUE_ENTITY_TYPE.Subgraph,
      systemId: 17,
    });
  });

  it('creates deterministic DFS-08 diagnostics in the existing singular Issue', () => {
    const issue = RoutingIssueFactory.noValidCombination({
      pathSubgraphSystemIds: [20, 30, 10],
      conflicts: [
        {
          keyDefSystemId: 9,
          conflictingSubgraphSystemIds: [20, 30],
        },
        {
          keyDefSystemId: 3,
          conflictingSubgraphSystemIds: [30, 10],
        },
        {
          keyDefSystemId: 9,
          conflictingSubgraphSystemIds: [30, 20],
        },
      ],
    });

    expect(issue.code).toBe('ARC-ROUTING-DFS-08');
    expect(issue.severity).toBe(IssueSeverity.Error);
    expect(issue.impactedEntity).toEqual({
      entityType: ISSUE_ENTITY_TYPE.Subgraph,
      systemId: 20,
    });
    expect(issue.message).toContain('keyDefinitionSystemIds: [3, 9]');
    expect(issue.message).toContain('key 3: subgraphs [10, 30]');
    expect(issue.message).toContain('key 9: subgraphs [20, 30]');
  });

  it('copies selection, snapshot collections, and nested requested SGKVs', () => {
    const sourceSgkvs = [[11], [12, 13]];
    const selectedUsecases = [createUsecase(21, [31])];
    const selectedUsecaseSystemIds = [21];
    const includedDataLinkSystemIds = [101];
    const includedControlLinkSystemIds = [201];
    const subgraph = createSubgraph(31);
    const snapshot: RoutingGraphSnapshot = {
      ...createSnapshot(subgraph),
      subgraphs: [{subgraph, requestedSgkvs: sourceSgkvs}],
    };
    const input = createManualRoutingInput({
      fileSystemId: 1,
      selection: {
        selectedUsecaseSystemIds,
        activeSubgraphs: [{systemId: 31, sgkvs: sourceSgkvs}],
        includedDataLinkSystemIds,
        includedControlLinkSystemIds,
      },
      selectedUsecases,
      graphSnapshot: snapshot,
      manualTopology: {pairs: [], isolatedSubgraphSystemIds: []},
      activeManualUsecaseEdits: [],
    });
    sourceSgkvs[0]!.push(99);
    selectedUsecases.push(createUsecase(22, [32]));
    selectedUsecaseSystemIds.push(22);
    includedDataLinkSystemIds.push(102);
    includedControlLinkSystemIds.push(202);
    expect(input.graphSnapshot.subgraphs[0]!.subgraph).toBe(subgraph);
    expect(input.graphSnapshot.subgraphs[0]!.requestedSgkvs).toEqual([
      [11],
      [12, 13],
    ]);
    expect(input.selectedUsecases).toHaveLength(1);
    expect(input.selection.selectedUsecaseSystemIds).toEqual([21]);
    expect(input.selection.includedDataLinkSystemIds).toEqual([101]);
    expect(input.selection.includedControlLinkSystemIds).toEqual([201]);
  });

  it('copies automatic selection and active-manual-edit containers', () => {
    const base = createInput();
    const selectedUsecaseSystemIds = [100];
    const requestedSgkv = [101];
    const activeSubgraphs: ActiveSubgraphSelection[] = [
      {systemId: 10, sgkvs: [requestedSgkv]},
    ];
    const selection: RoutingSelection = {
      selectedUsecaseSystemIds,
      activeSubgraphs,
      includedDataLinkSystemIds: [],
      includedControlLinkSystemIds: [],
    };
    const activeManualUsecaseEdits = [createActiveManualUsecaseEdit(41)];
    const input = createAutoRoutingInput({
      fileSystemId: base.fileSystemId,
      selection,
      selectedUsecases: base.selectedUsecases,
      graphSnapshot: base.graphSnapshot,
      activeManualUsecaseEdits,
    });

    selectedUsecaseSystemIds.push(999);
    requestedSgkv.push(999);
    activeManualUsecaseEdits.push(createActiveManualUsecaseEdit(42));

    expect(input.selection.selectedUsecaseSystemIds).not.toContain(999);
    expect(input.selection.activeSubgraphs[0]?.sgkvs[0]).not.toContain(999);
    expect(input.activeManualUsecaseEdits).toHaveLength(1);
  });

  it('preserves session edits in the snapshot', () => {
    const deletedSubgraph = createSubgraph(20);
    const sessionEdits = {
      ...emptyGraphEdits(),
      deletedSgs: [deletedSubgraph],
    };
    const input = createManualRoutingInput({
      ...createInput(),
      selection: {
        ...createInput().selection,
        activeSubgraphs: [
          {systemId: 10, sgkvs: []},
          {systemId: 20, sgkvs: []},
        ],
      },
      graphSnapshot: {
        ...createSnapshot(),
        sessionEdits,
      },
      manualTopology: {pairs: [], isolatedSubgraphSystemIds: []},
    });
    sessionEdits.deletedSgs.push(createSubgraph(30));
    expect(input.graphSnapshot.sessionEdits.deletedSgs).toEqual([
      deletedSubgraph,
    ]);
    expect(Object.isFrozen(input.graphSnapshot.sessionEdits)).toBe(true);
    expect(Object.isFrozen(input.graphSnapshot.sessionEdits.deletedSgs)).toBe(
      true,
    );
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

  it('assembleManualTopology isolates pair collections from caller-owned arrays', () => {
    const dataLinks = [createDataLink(1, 10, 20)];
    const result = assembleManualTopology(dataLinks, [], [10, 20]);
    expect(result.kind).toBe('OK');
    const pair = result.data.pairs[0];
    // Mutating the original array must not affect the frozen pair.
    dataLinks.push(createDataLink(3, 10, 20));
    expect(pair.dataLinks.map(link => link.systemId)).toEqual([1]);
  });

  it('copies MDF classification and committed data links through snapshot copy', () => {
    const link = createDataLink(1, 10, 20);
    const input = createAutoRoutingInput({
      fileSystemId: 1,
      selection: {
        selectedUsecaseSystemIds: [],
        activeSubgraphs: [],
        includedDataLinkSystemIds: [],
        includedControlLinkSystemIds: [],
      },
      selectedUsecases: [],
      graphSnapshot: {
        subgraphs: [],
        mdf: {effective: new Set([33]), deleted: new Set([11, 22])},
        routableDataLinks: [],
        routableControlLinks: [],
        overlayDataLinks: [],
        overlayControlLinks: [],
        committedUsecases: [],
        sessionEdits: emptyGraphEdits(),
        committedDataLinks: [link],
      },
      activeManualUsecaseEdits: [],
    });

    expect(input.graphSnapshot.mdf.effective).toEqual(new Set([33]));
    expect(input.graphSnapshot.mdf.deleted).toEqual(new Set([11, 22]));
    expect(input.graphSnapshot.committedDataLinks).toHaveLength(1);
    expect(input.graphSnapshot.committedDataLinks[0]).toBe(link);
  });
});
