/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ControlLink} from '../../../../domain/entities/usecase-data/links/control-link.js';
import type {DataLink} from '../../../../domain/entities/usecase-data/links/data-link.js';
import type {Subgraph} from '../../../../domain/entities/usecase-data/subgraph/subgraph.js';
import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {SubgraphPair} from '../../../ports/persistence/repositories/shared/links-for-pair.js';
import type {ActiveManualUsecaseEdit} from '../../../ports/persistence/repositories/usecase/usecase.repository.js';

export const ROUTING_MODE = {Auto: 'AUTO', Manual: 'MANUAL'} as const;
export type RoutingMode = (typeof ROUTING_MODE)[keyof typeof ROUTING_MODE];

export interface ActiveSubgraphSelection {
  readonly systemId: number;
  readonly sgkvs: readonly (readonly number[])[];
}

/** Canonical numeric representation produced by resolveRoutingLinkSelection (Phase 0). */
export interface RoutingSelection {
  readonly activeSubgraphs: readonly ActiveSubgraphSelection[];
  readonly includedDataLinkSystemIds: readonly number[];
  readonly includedControlLinkSystemIds: readonly number[];
  readonly selectedUsecaseSystemIds?: readonly number[];
}

export interface GraphEditSummary {
  readonly addedSgs: readonly Subgraph[];
  readonly deletedSgs: readonly Subgraph[];
  readonly addedDataLinks: readonly DataLink[];
  readonly deletedDataLinks: readonly DataLink[];
  readonly addedControlLinks: readonly ControlLink[];
  readonly deletedControlLinks: readonly ControlLink[];
}

export interface RoutingSubgraph {
  readonly subgraph: Subgraph;
  readonly requestedSgkvs: readonly (readonly number[])[];
}

/** MDF membership derived for the current routing snapshot. */
export interface SnapshotMdfClassification {
  /** MDF subgraphs present in the effective session overlay. */
  readonly effective: ReadonlySet<number>;
  /**
   * Subgraphs that were MDF members in committed state but are absent from the
   * effective session overlay. Used only for reverse topology analysis; these
   * IDs must never make a deleted subgraph routable.
   */
  readonly deleted: ReadonlySet<number>;
}

export interface RoutingGraphSnapshot {
  readonly subgraphs: readonly RoutingSubgraph[];
  readonly mdf: SnapshotMdfClassification;
  readonly routableDataLinks: readonly DataLink[];
  readonly routableControlLinks: readonly ControlLink[];
  readonly overlayDataLinks: readonly DataLink[];
  readonly overlayControlLinks: readonly ControlLink[];
  readonly committedUsecases: readonly UseCase[];
  readonly sessionEdits: GraphEditSummary;
  /**
   * All NORMAL data links in committed (base-table) state for this file.
   * Populated by RoutingGraphSnapshotBuilder via READ_MODE.Committed.
   * Consumers derive lookup sets locally; do not mutate.
   */
  readonly committedDataLinks: readonly DataLink[];
}

export interface ManualTopologyPair {
  readonly pair: SubgraphPair;
  readonly dataLinks: readonly DataLink[];
  readonly controlLinks: readonly ControlLink[];
}

export interface ManualTopology {
  readonly pairs: readonly ManualTopologyPair[];
  /**
   * Subgraphs in the manual routing scope that are not endpoints of any pair.
   * They participate in the combined SGKV expansion alongside pair-connected
   * subgraphs — all members form one topology and one set of usecases.
   * Their absence from any pair causes the usecase type to be ISLAND.
   */
  readonly isolatedSubgraphSystemIds: readonly number[];
}

/**
 * Fields shared by both routing modes and copied by their input factories.
 * Automatic routing accepts this shape directly; manual routing adds topology.
 */
interface RoutingInputBase {
  readonly fileSystemId: number;
  readonly selection: RoutingSelection;
  readonly selectedUsecases: readonly UseCase[];
  readonly graphSnapshot: RoutingGraphSnapshot;
  /** Used in both modes to validate dependencies and resolve edit precedence. */
  readonly activeManualUsecaseEdits: readonly ActiveManualUsecaseEdit[];
}

export interface AutoRoutingInput extends RoutingInputBase {
  readonly mode: typeof ROUTING_MODE.Auto;
}

export interface ManualRoutingInput extends RoutingInputBase {
  readonly mode: typeof ROUTING_MODE.Manual;
  readonly manualTopology: ManualTopology;
}

export type RoutingInput = AutoRoutingInput | ManualRoutingInput;

/** Adds the topology consumed only by `createManualRoutingInput`. */
export interface ManualRoutingInputInit
  extends RoutingInputBase, Pick<ManualRoutingInput, 'manualTopology'> {}

export function findDuplicateActiveSubgraphSystemIds(
  subgraphSystemIds: readonly number[],
): ReadonlySet<number> {
  const seen = new Set<number>();
  const duplicates = new Set<number>();
  for (const id of subgraphSystemIds) {
    if (seen.has(id)) duplicates.add(id);
    else seen.add(id);
  }
  return duplicates;
}

function copySelections(
  selections: readonly ActiveSubgraphSelection[],
): readonly ActiveSubgraphSelection[] {
  return selections.map(selection => ({
    systemId: selection.systemId,
    sgkvs: selection.sgkvs.map(values => [...values]),
  }));
}

/** Copies edit collection containers while retaining borrowed domain entities. */
export function copyGraphEditSummary(
  edits: GraphEditSummary,
): GraphEditSummary {
  return Object.freeze({
    addedSgs: Object.freeze([...edits.addedSgs]),
    deletedSgs: Object.freeze([...edits.deletedSgs]),
    addedDataLinks: Object.freeze([...edits.addedDataLinks]),
    deletedDataLinks: Object.freeze([...edits.deletedDataLinks]),
    addedControlLinks: Object.freeze([...edits.addedControlLinks]),
    deletedControlLinks: Object.freeze([...edits.deletedControlLinks]),
  });
}

function copyGraphSnapshot(
  snapshot: RoutingGraphSnapshot,
): RoutingGraphSnapshot {
  return Object.freeze({
    subgraphs: Object.freeze(
      snapshot.subgraphs.map(item =>
        Object.freeze({
          subgraph: item.subgraph,
          requestedSgkvs: Object.freeze(
            item.requestedSgkvs.map(values => Object.freeze([...values])),
          ),
        }),
      ),
    ),
    mdf: Object.freeze({
      effective: new Set(snapshot.mdf.effective),
      deleted: new Set(snapshot.mdf.deleted),
    }),
    routableDataLinks: Object.freeze([...snapshot.routableDataLinks]),
    routableControlLinks: Object.freeze([...snapshot.routableControlLinks]),
    overlayDataLinks: Object.freeze([...snapshot.overlayDataLinks]),
    overlayControlLinks: Object.freeze([...snapshot.overlayControlLinks]),
    committedUsecases: Object.freeze([...snapshot.committedUsecases]),
    sessionEdits: copyGraphEditSummary(snapshot.sessionEdits),
    committedDataLinks: Object.freeze([...(snapshot.committedDataLinks ?? [])]),
  });
}

export function createManualRoutingInput(
  init: ManualRoutingInputInit,
): ManualRoutingInput {
  return {
    ...copyBase(init),
    mode: ROUTING_MODE.Manual,
    manualTopology: Object.freeze({
      pairs: Object.freeze([...init.manualTopology.pairs]),
      isolatedSubgraphSystemIds: Object.freeze([
        ...init.manualTopology.isolatedSubgraphSystemIds,
      ]),
    }),
  };
}

function copyBase(init: RoutingInputBase): RoutingInputBase {
  return {
    fileSystemId: init.fileSystemId,
    selection: copyRoutingSelection(init.selection),
    selectedUsecases: [...init.selectedUsecases],
    graphSnapshot: copyGraphSnapshot(init.graphSnapshot),
    activeManualUsecaseEdits: copyActiveManualUsecaseEdits(
      init.activeManualUsecaseEdits,
    ),
  };
}

function copyRoutingSelection(selection: RoutingSelection): RoutingSelection {
  return Object.freeze({
    activeSubgraphs: Object.freeze(copySelections(selection.activeSubgraphs)),
    includedDataLinkSystemIds: Object.freeze([
      ...(selection.includedDataLinkSystemIds ?? []),
    ]),
    includedControlLinkSystemIds: Object.freeze([
      ...(selection.includedControlLinkSystemIds ?? []),
    ]),
    ...(selection.selectedUsecaseSystemIds !== undefined && {
      selectedUsecaseSystemIds: Object.freeze([
        ...selection.selectedUsecaseSystemIds,
      ]),
    }),
  });
}

function copyActiveManualUsecaseEdits(
  edits: readonly ActiveManualUsecaseEdit[],
): readonly ActiveManualUsecaseEdit[] {
  return Object.freeze(
    edits.map(edit =>
      Object.freeze({
        ...edit,
        referencedComponents: edit.referencedComponents
          ? Object.freeze({
              sgSystemIds: Object.freeze([
                ...edit.referencedComponents.sgSystemIds,
              ]),
              dataLinkSystemIds: Object.freeze([
                ...edit.referencedComponents.dataLinkSystemIds,
              ]),
              controlLinkSystemIds: Object.freeze([
                ...edit.referencedComponents.controlLinkSystemIds,
              ]),
            })
          : null,
      }),
    ),
  );
}

export function createAutoRoutingInput(
  init: RoutingInputBase,
): AutoRoutingInput {
  return {
    ...copyBase(init),
    mode: ROUTING_MODE.Auto,
  };
}

export function emptyGraphEdits(): GraphEditSummary {
  return {
    addedSgs: [],
    deletedSgs: [],
    addedDataLinks: [],
    deletedDataLinks: [],
    addedControlLinks: [],
    deletedControlLinks: [],
  };
}
