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

/** Parsed, JSON-safe representation of the client's routing selection. */
export interface RoutingSelection {
  readonly selectedUsecaseSystemIds: readonly number[];
  readonly activeSubgraphs: readonly ActiveSubgraphSelection[];
  readonly excludedSubgraphSystemIds: readonly number[];
  readonly excludedDataLinkSystemIds: readonly number[];
  readonly excludedControlLinkSystemIds: readonly number[];
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
  readonly isMdf: boolean;
}

export interface RoutingGraphSnapshot {
  readonly subgraphs: readonly RoutingSubgraph[];
  readonly routableDataLinks: readonly DataLink[];
  readonly routableControlLinks: readonly ControlLink[];
  readonly overlayDataLinks: readonly DataLink[];
  readonly overlayControlLinks: readonly ControlLink[];
  readonly committedUsecases: readonly UseCase[];
  readonly sessionEdits: GraphEditSummary;
}

export interface ManualTopologyPair {
  readonly pair: SubgraphPair;
  readonly dataLinks: readonly DataLink[];
  readonly controlLinks: readonly ControlLink[];
}

export interface ManualTopology {
  readonly pairs: readonly ManualTopologyPair[];
}

interface RoutingInputBase {
  readonly mode: RoutingMode;
  readonly fileSystemId: number;
  readonly selection: RoutingSelection;
  readonly selectedUsecases: readonly UseCase[];
  readonly graphSnapshot: RoutingGraphSnapshot;
}

export interface AutoRoutingInput extends RoutingInputBase {
  readonly mode: typeof ROUTING_MODE.Auto;
  readonly activeManualUsecaseEdits: readonly ActiveManualUsecaseEdit[];
}

export interface ManualRoutingInput extends RoutingInputBase {
  readonly mode: typeof ROUTING_MODE.Manual;
  readonly manualTopology: ManualTopology;
}

export type RoutingInput = AutoRoutingInput | ManualRoutingInput;

interface RoutingInputInitBase {
  readonly fileSystemId: number;
  readonly selection: RoutingSelection;
  readonly selectedUsecases: readonly UseCase[];
  readonly graphSnapshot: RoutingGraphSnapshot;
}

export interface AutoRoutingInputInit extends RoutingInputInitBase {
  readonly activeManualUsecaseEdits: readonly ActiveManualUsecaseEdit[];
}

export interface ManualRoutingInputInit
  extends RoutingInputInitBase, Pick<ManualRoutingInput, 'manualTopology'> {}

export interface DerivedRoutingScope {
  readonly selectedScopeSubgraphs: ReadonlySet<number>;
  readonly inputSubgraphs: ReadonlySet<number>;
  readonly outOfSelectionSubgraphs: ReadonlySet<number>;
  readonly effectiveRoutingScope: ReadonlySet<number>;
  readonly missingSelectedScopeSubgraphs: ReadonlySet<number>;
  readonly effectiveActiveSubgraphs: readonly ActiveSubgraphSelection[];
}

export function findDuplicateActiveSubgraphSystemIds(
  activeSubgraphs: readonly ActiveSubgraphSelection[],
): ReadonlySet<number> {
  const seen = new Set<number>();
  const duplicates = new Set<number>();
  for (const selection of activeSubgraphs) {
    if (seen.has(selection.systemId)) duplicates.add(selection.systemId);
    else seen.add(selection.systemId);
  }
  return duplicates;
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
          isMdf: item.isMdf,
        }),
      ),
    ),
    routableDataLinks: Object.freeze([...snapshot.routableDataLinks]),
    routableControlLinks: Object.freeze([...snapshot.routableControlLinks]),
    overlayDataLinks: Object.freeze([...snapshot.overlayDataLinks]),
    overlayControlLinks: Object.freeze([...snapshot.overlayControlLinks]),
    committedUsecases: Object.freeze([...snapshot.committedUsecases]),
    sessionEdits: copyGraphEditSummary(snapshot.sessionEdits),
  });
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

function copyBase(init: RoutingInputInitBase): Omit<RoutingInputBase, 'mode'> {
  return {
    fileSystemId: init.fileSystemId,
    selection: copyRoutingSelection(init.selection),
    selectedUsecases: [...init.selectedUsecases],
    graphSnapshot: copyGraphSnapshot(init.graphSnapshot),
  };
}

function copyRoutingSelection(selection: RoutingSelection): RoutingSelection {
  return Object.freeze({
    selectedUsecaseSystemIds: Object.freeze([
      ...selection.selectedUsecaseSystemIds,
    ]),
    activeSubgraphs: Object.freeze(copySelections(selection.activeSubgraphs)),
    excludedSubgraphSystemIds: Object.freeze([
      ...selection.excludedSubgraphSystemIds,
    ]),
    excludedDataLinkSystemIds: Object.freeze([
      ...selection.excludedDataLinkSystemIds,
    ]),
    excludedControlLinkSystemIds: Object.freeze([
      ...selection.excludedControlLinkSystemIds,
    ]),
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

/** Creates a manual pair holding borrowed immutable data-link references. */
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

/** Creates a manual pair holding borrowed immutable control-link references. */
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
  init: AutoRoutingInputInit,
): AutoRoutingInput {
  return {
    ...copyBase(init),
    mode: ROUTING_MODE.Auto,
    activeManualUsecaseEdits: copyActiveManualUsecaseEdits(
      init.activeManualUsecaseEdits,
    ),
  };
}

export function createManualRoutingInput(
  init: ManualRoutingInputInit,
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
