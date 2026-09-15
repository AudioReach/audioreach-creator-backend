/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ControlLink} from '../../../../domain/entities/usecase-data/links/control-link.js';
import type {DataLink} from '../../../../domain/entities/usecase-data/links/data-link.js';
import type {Subgraph} from '../../../../domain/entities/usecase-data/subgraph/subgraph.js';
import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {SubgraphPair} from '../../../ports/persistence/repositories/shared/links-for-pair.js';

export const ROUTING_MODE = {Auto: 'AUTO', Manual: 'MANUAL'} as const;
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

export interface ManualTopologyPair {
  readonly pair: SubgraphPair;
  readonly dataLinks: readonly DataLink[];
  readonly controlLinks: readonly ControlLink[];
}

export interface ManualTopology {
  readonly pairs: readonly ManualTopologyPair[];
}

export interface RoutingScopePolicy {
  readonly requestedSubgraphSystemIds: ReadonlySet<number>;
  readonly excludedSubgraphSystemIds: ReadonlySet<number>;
}

interface RoutingInputBase {
  readonly selectedUsecases: readonly UseCase[];
  readonly activeSubgraphs: readonly ActiveSubgraphSelection[];
  readonly scopePolicy: RoutingScopePolicy;
  readonly excludedDataLinkSystemIds: readonly number[];
  readonly excludedControlLinkSystemIds: readonly number[];
  readonly graphEdits: GraphEditSummary;
}

export interface AutoRoutingInput extends RoutingInputBase {
  readonly mode: typeof ROUTING_MODE.Auto;
  readonly islandUcs: readonly UseCase[];
}

export interface ManualRoutingInput extends RoutingInputBase {
  readonly mode: typeof ROUTING_MODE.Manual;
  readonly manualTopology: ManualTopology;
}

export type RoutingInput = AutoRoutingInput | ManualRoutingInput;

export interface RoutingInputInit {
  readonly selectedUsecases: readonly UseCase[];
  readonly activeSubgraphs: readonly ActiveSubgraphSelection[];
  readonly scopePolicy: RoutingScopePolicy;
  readonly excludedDataLinkSystemIds?: readonly number[];
  readonly excludedControlLinkSystemIds?: readonly number[];
  readonly graphEdits: GraphEditSummary;
}

export interface DerivedRoutingScope {
  readonly selectedScopeSubgraphs: ReadonlySet<number>;
  readonly inputSubgraphs: ReadonlySet<number>;
  readonly outOfSelectionSubgraphs: ReadonlySet<number>;
  readonly effectiveRoutingScope: ReadonlySet<number>;
  readonly missingSelectedScopeSubgraphs: ReadonlySet<number>;
  readonly effectiveActiveSubgraphs: readonly ActiveSubgraphSelection[];
}

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
  const isUnavailable = (id: number): boolean =>
    excludedSubgraphs.has(id) || deletedSubgraphs.has(id);
  const outOfSelectionSubgraphs = new Set<number>();
  for (const id of inputSubgraphs)
    if (!selectedScopeSubgraphs.has(id)) outOfSelectionSubgraphs.add(id);
  const effectiveRoutingScope = new Set<number>();
  for (const id of inputSubgraphs)
    if (!isUnavailable(id)) effectiveRoutingScope.add(id);
  const missingSelectedScopeSubgraphs = new Set<number>();
  for (const id of selectedScopeSubgraphs)
    if (!isUnavailable(id) && !inputSubgraphs.has(id))
      missingSelectedScopeSubgraphs.add(id);
  return {
    selectedScopeSubgraphs,
    inputSubgraphs,
    outOfSelectionSubgraphs,
    effectiveRoutingScope,
    missingSelectedScopeSubgraphs,
    effectiveActiveSubgraphs: copySelections(
      activeSubgraphs.filter(selection => !isUnavailable(selection.systemId)),
    ),
  };
}

function copySelections(
  selections: readonly ActiveSubgraphSelection[],
): readonly ActiveSubgraphSelection[] {
  return selections.map(selection => ({
    systemId: selection.systemId,
    sgkvs: selection.sgkvs.map(values => [...values]),
  }));
}

function copyTopologyPair(pair: ManualTopologyPair): ManualTopologyPair {
  if (pair.dataLinks.length > 0 && pair.controlLinks.length === 0) {
    return createDataLinkManualTopologyPair(pair.pair, pair.dataLinks);
  }
  if (pair.controlLinks.length > 0 && pair.dataLinks.length === 0) {
    return createControlLinkManualTopologyPair(pair.pair, pair.controlLinks);
  }
  throw new Error('Manual topology pairs require exactly one support type');
}

function copyBase(init: RoutingInputInit): RoutingInputBase {
  return {
    selectedUsecases: [...init.selectedUsecases],
    activeSubgraphs: copySelections(init.activeSubgraphs),
    scopePolicy: {
      requestedSubgraphSystemIds: new Set(
        init.scopePolicy.requestedSubgraphSystemIds,
      ),
      excludedSubgraphSystemIds: new Set(
        init.scopePolicy.excludedSubgraphSystemIds,
      ),
    },
    excludedDataLinkSystemIds: [...(init.excludedDataLinkSystemIds ?? [])],
    excludedControlLinkSystemIds: [
      ...(init.excludedControlLinkSystemIds ?? []),
    ],
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

export function createDataLinkManualTopologyPair(
  pair: SubgraphPair,
  dataLinks: readonly DataLink[],
): ManualTopologyPair {
  if (
    dataLinks.length === 0 ||
    dataLinks.some(
      link =>
        link.sourceSubgraphSystemId !== pair.sourceSubgraphSystemId ||
        link.destSubgraphSystemId !== pair.destSubgraphSystemId,
    )
  ) {
    throw new Error(
      'Manual data topology support must be non-empty and match the directed pair',
    );
  }
  return Object.freeze({
    pair: Object.freeze({...pair}),
    dataLinks: Object.freeze([...dataLinks]),
    controlLinks: Object.freeze([] as ControlLink[]),
  });
}

export function createControlLinkManualTopologyPair(
  pair: SubgraphPair,
  controlLinks: readonly ControlLink[],
): ManualTopologyPair {
  if (
    pair.sourceSubgraphSystemId > pair.destSubgraphSystemId ||
    controlLinks.length === 0 ||
    controlLinks.some(
      link =>
        !(
          (link.sourceSubgraphSystemId === pair.sourceSubgraphSystemId &&
            link.destSubgraphSystemId === pair.destSubgraphSystemId) ||
          (link.sourceSubgraphSystemId === pair.destSubgraphSystemId &&
            link.destSubgraphSystemId === pair.sourceSubgraphSystemId)
        ),
    )
  ) {
    throw new Error(
      'Manual control topology support must be non-empty, peer-matched, and canonically ordered',
    );
  }
  return Object.freeze({
    pair: Object.freeze({...pair}),
    dataLinks: Object.freeze([] as DataLink[]),
    controlLinks: Object.freeze([...controlLinks]),
  });
}

export function createAutoRoutingInput(
  init: RoutingInputInit & {readonly islandUcs: readonly UseCase[]},
): AutoRoutingInput {
  return {
    ...copyBase(init),
    mode: ROUTING_MODE.Auto,
    islandUcs: [...init.islandUcs],
  };
}

export function createManualRoutingInput(
  init: RoutingInputInit & {readonly manualTopology: ManualTopology},
): ManualRoutingInput {
  return {
    ...copyBase(init),
    mode: ROUTING_MODE.Manual,
    manualTopology: Object.freeze({
      pairs: Object.freeze(
        init.manualTopology.pairs.map(pair => copyTopologyPair(pair)),
      ),
    }),
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
