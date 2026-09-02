/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ControlLink} from '../../../../domain/entities/usecase-data/links/control-link.js';
import type {DataLink} from '../../../../domain/entities/usecase-data/links/data-link.js';
import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {SubgraphPair} from '../../../ports/persistence/repositories/shared/links-for-pair.js';
import type {Subgraph} from '../../../../domain/entities/usecase-data/subgraph/subgraph.js';

export const ROUTING_MODE = {
  Auto: 'AUTO',
  Manual: 'MANUAL',
} as const;

export type RoutingMode = (typeof ROUTING_MODE)[keyof typeof ROUTING_MODE];

export interface ActiveSubgraphSelection {
  readonly systemId: number;
  readonly sgkvs: readonly (readonly number[])[];
}

export interface GraphEditSummary {
  readonly addedSgs: readonly Subgraph[];
  readonly deletedSgs: readonly Subgraph[];
  readonly addedDataLinks: readonly DataLink[];
  readonly deletedDataLinks: readonly DataLink[];
  readonly addedControlLinks: readonly ControlLink[];
  readonly deletedControlLinks: readonly ControlLink[];
}

export interface ManualTopology {
  readonly pairs: readonly SubgraphPair[];
  readonly supportingDataLinkSystemIds: readonly number[];
  readonly supportingControlLinkSystemIds: readonly number[];
  readonly isolatedSubgraphSystemIds: readonly number[];
}

interface RoutingInputBase {
  /** IDs selected by the caller; retained for request-level correlation. */
  readonly selectedUsecaseSystemIds: readonly number[];
  /**
   * Effective-overlay UC snapshots loaded by the handler once. Unlike the IDs
   * above, these contain the memberships and other data needed by phases.
   */
  readonly selectedUsecases: readonly UseCase[];
  /** Ordered SGKV selections remaining after excluded/deleted SG removal. */
  readonly activeSubgraphs: readonly ActiveSubgraphSelection[];
  readonly excludedDataLinkSystemIds: readonly number[];
  readonly excludedControlLinkSystemIds: readonly number[];
  /** Explicit SG exclusions supplied by the caller. */
  readonly excludedSubgraphSystemIds: readonly number[];
  /**
   * Handler-derived union of SG memberships from selectedUsecases. This is
   * not the same as inputSubgraphs: it describes the selected UC scope.
   */
  readonly selectedScopeSubgraphs: ReadonlySet<number>;
  /** SGs explicitly present in activeSubgraphs, before SG exclusions. */
  readonly inputSubgraphs: ReadonlySet<number>;
  /** inputSubgraphs that are outside the selected UC scope. */
  readonly outOfSelectionSubgraphs: ReadonlySet<number>;
  /** inputSubgraphs after removing excluded and session-deleted SGs. */
  readonly effectiveRoutingScope: ReadonlySet<number>;
  readonly graphEdits: GraphEditSummary;
}

export interface AutoRoutingInput extends RoutingInputBase {
  readonly mode: typeof ROUTING_MODE.Auto;
  /** Committed ISLAND UCs present before this routing run starts. */
  readonly islandUcs: readonly UseCase[];
}

export interface ManualRoutingInput extends RoutingInputBase {
  readonly mode: typeof ROUTING_MODE.Manual;
  readonly manualTopology: ManualTopology;
}

export type RoutingInput = AutoRoutingInput | ManualRoutingInput;

export interface RoutingInputInit {
  /** Request-selected UC IDs before the handler loads their snapshots. */
  readonly selectedUsecaseSystemIds: readonly number[];
  /** Handler-loaded effective-overlay snapshots corresponding to the IDs. */
  readonly selectedUsecases: readonly UseCase[];
  /** Handler-normalized SGKV selections, preserved in caller order. */
  readonly activeSubgraphs: readonly ActiveSubgraphSelection[];
  readonly excludedDataLinkSystemIds?: readonly number[];
  readonly excludedControlLinkSystemIds?: readonly number[];
  readonly excludedSubgraphSystemIds?: readonly number[];
  /** Union of SG memberships from the selected UC snapshots. */
  readonly selectedScopeSubgraphs: ReadonlySet<number>;
  /** SG IDs present in the original request, before exclusions/deletions. */
  readonly inputSubgraphs: ReadonlySet<number>;
  /** Requested SG IDs not used by any selected UC. */
  readonly outOfSelectionSubgraphs: ReadonlySet<number>;
  /** Final SG boundary available to routing phases. */
  readonly effectiveRoutingScope: ReadonlySet<number>;
  readonly graphEdits: GraphEditSummary;
}

export interface DerivedRoutingScope {
  readonly selectedScopeSubgraphs: ReadonlySet<number>;
  readonly inputSubgraphs: ReadonlySet<number>;
  readonly outOfSelectionSubgraphs: ReadonlySet<number>;
  readonly effectiveRoutingScope: ReadonlySet<number>;
  readonly missingSelectedScopeSubgraphs: ReadonlySet<number>;
  /** Caller-ordered selections after excluded/deleted SG removal. */
  readonly effectiveActiveSubgraphs: readonly ActiveSubgraphSelection[];
}

/** Derive the handler-owned routing scope before routing services run. */
export function deriveRoutingScope(
  selectedUsecases: readonly UseCase[],
  activeSubgraphs: readonly ActiveSubgraphSelection[],
  excludedSubgraphSystemIds: readonly number[],
  deletedSubgraphSystemIds: readonly number[] = [],
): DerivedRoutingScope {
  const selectedScopeSubgraphs = new Set<number>();
  for (const usecase of selectedUsecases) {
    for (const subgraphSystemId of usecase.subgraphSystemIds) {
      selectedScopeSubgraphs.add(subgraphSystemId);
    }
  }

  const inputSubgraphs = new Set(
    activeSubgraphs.map(subgraph => subgraph.systemId),
  );
  const excludedSubgraphs = new Set(excludedSubgraphSystemIds);
  const deletedSubgraphs = new Set(deletedSubgraphSystemIds);
  const isUnavailable = (subgraphSystemId: number): boolean =>
    excludedSubgraphs.has(subgraphSystemId) ||
    deletedSubgraphs.has(subgraphSystemId);
  const outOfSelectionSubgraphs = new Set<number>();
  for (const subgraphSystemId of inputSubgraphs) {
    if (!selectedScopeSubgraphs.has(subgraphSystemId)) {
      outOfSelectionSubgraphs.add(subgraphSystemId);
    }
  }

  const effectiveRoutingScope = new Set<number>();
  for (const subgraphSystemId of inputSubgraphs) {
    if (!isUnavailable(subgraphSystemId)) {
      effectiveRoutingScope.add(subgraphSystemId);
    }
  }

  const missingSelectedScopeSubgraphs = new Set<number>();
  for (const subgraphSystemId of selectedScopeSubgraphs) {
    if (
      !isUnavailable(subgraphSystemId) &&
      !inputSubgraphs.has(subgraphSystemId)
    ) {
      missingSelectedScopeSubgraphs.add(subgraphSystemId);
    }
  }

  const effectiveActiveSubgraphs = copySelections(
    activeSubgraphs.filter(selection => !isUnavailable(selection.systemId)),
  );

  return {
    selectedScopeSubgraphs,
    inputSubgraphs,
    outOfSelectionSubgraphs,
    effectiveRoutingScope,
    missingSelectedScopeSubgraphs,
    effectiveActiveSubgraphs,
  };
}

/** Deep-copy SGKV selections. */
function copySelections(
  selections: readonly ActiveSubgraphSelection[],
): readonly ActiveSubgraphSelection[] {
  return selections.map(selection => ({
    systemId: selection.systemId,
    sgkvs: selection.sgkvs.map(values => [...values]),
  }));
}

/** Copy shared input and normalize exclusions. */
function copyBase(init: RoutingInputInit): RoutingInputBase {
  return {
    selectedUsecaseSystemIds: [...init.selectedUsecaseSystemIds],
    selectedUsecases: [...init.selectedUsecases],
    activeSubgraphs: copySelections(init.activeSubgraphs),
    excludedDataLinkSystemIds: [...(init.excludedDataLinkSystemIds ?? [])],
    excludedControlLinkSystemIds: [
      ...(init.excludedControlLinkSystemIds ?? []),
    ],
    excludedSubgraphSystemIds: [...(init.excludedSubgraphSystemIds ?? [])],
    selectedScopeSubgraphs: new Set(init.selectedScopeSubgraphs),
    inputSubgraphs: new Set(init.inputSubgraphs),
    outOfSelectionSubgraphs: new Set(init.outOfSelectionSubgraphs),
    effectiveRoutingScope: new Set(init.effectiveRoutingScope),
    graphEdits: {
      addedSgs: [...init.graphEdits.addedSgs],
      deletedSgs: [...init.graphEdits.deletedSgs],
      addedDataLinks: [...init.graphEdits.addedDataLinks],
      deletedDataLinks: [...init.graphEdits.deletedDataLinks],
      addedControlLinks: [...init.graphEdits.addedControlLinks],
      deletedControlLinks: [...init.graphEdits.deletedControlLinks],
    },
  };
}

/** Build immutable automatic-routing input. */
export function createAutoRoutingInput(
  init: RoutingInputInit & {readonly islandUcs: readonly UseCase[]},
): AutoRoutingInput {
  return {
    ...copyBase(init),
    mode: ROUTING_MODE.Auto,
    islandUcs: [...init.islandUcs],
  };
}

/** Build immutable manual-routing input. */
export function createManualRoutingInput(
  init: RoutingInputInit & {readonly manualTopology: ManualTopology},
): ManualRoutingInput {
  return {
    ...copyBase(init),
    mode: ROUTING_MODE.Manual,
    manualTopology: {
      pairs: [...init.manualTopology.pairs],
      supportingDataLinkSystemIds: [
        ...init.manualTopology.supportingDataLinkSystemIds,
      ],
      supportingControlLinkSystemIds: [
        ...init.manualTopology.supportingControlLinkSystemIds,
      ],
      isolatedSubgraphSystemIds: [
        ...init.manualTopology.isolatedSubgraphSystemIds,
      ],
    },
  };
}

/** Create an empty graph-edit summary. */
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
