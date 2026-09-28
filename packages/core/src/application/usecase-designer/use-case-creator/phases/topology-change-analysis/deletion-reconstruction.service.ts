/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../../application/shared/result/result.js';
import type {Result as ResultType} from '../../../../../application/shared/result/result.js';
import type {
  SgkvEntry,
  SubgraphRepository,
} from '../../../../ports/persistence/repositories/subgraph/subgraph.repository.js';
import type {RoutingInput} from '../../contracts/routing-input.js';
import {ROUTING_MODE} from '../../contracts/routing-input.js';
import type {
  DfsPath,
  DeleteOrReconstructDecision,
  UsecaseTopologyDecision,
} from '../../contracts/routing-state.js';
import type {
  DirectedEdge,
  TopologyImpactInventory,
} from './topology-impact-inventory.js';
import {DATA_LINK_TYPE} from '../../../../../domain/entities/usecase-data/links/data-link-type.js';
import type {UseCase} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';

export interface DeletionReconstructionRequest {
  readonly input: RoutingInput;
  readonly inventory: TopologyImpactInventory;
  readonly decisions: readonly UsecaseTopologyDecision[];
}

interface LegacyEcBoundary {
  readonly pairKey: string;
  readonly sourceSubgraphSystemId: number;
  readonly destSubgraphSystemId: number;
}

function unorderedPairKey(firstId: number, secondId: number): string {
  const low = Math.min(firstId, secondId);
  const high = Math.max(firstId, secondId);
  return `${low}<->${high}`;
}

function canonicalSgkvValues(valueSystemIds: readonly number[]): string | null {
  if (valueSystemIds.length === 0) return null;
  return [...new Set(valueSystemIds)]
    .sort((left, right) => left - right)
    .join(',');
}

function sameCanonicalSgkvSets(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean {
  return left.size === right.size && [...left].every(value => right.has(value));
}

function requestedSgkvSet(
  input: RoutingInput,
  subgraphSystemId: number,
): ReadonlySet<string> | null {
  const routingSubgraph = input.graphSnapshot.subgraphs.find(
    candidate => candidate.subgraph.systemId === subgraphSystemId,
  );
  if (routingSubgraph === undefined) return null;
  const values = new Set<string>();
  for (const requestedSgkv of routingSubgraph.requestedSgkvs) {
    const canonical = canonicalSgkvValues(requestedSgkv);
    if (canonical !== null) values.add(canonical);
  }
  return values;
}

function filteredBaselineSgkvSet(
  entries: readonly SgkvEntry[],
  selectedValueSystemIds: ReadonlySet<number>,
): ReadonlySet<string> {
  const values = new Set<string>();
  for (const entry of entries) {
    const canonical = canonicalSgkvValues(
      entry.keyValues
        .filter(value => selectedValueSystemIds.has(value.valueDefSystemId))
        .map(value => value.valueDefSystemId),
    );
    if (canonical !== null) values.add(canonical);
  }
  return values;
}

function legacyEcBoundaries(
  input: RoutingInput,
  usecase: UseCase,
): readonly LegacyEcBoundary[] {
  if (usecase.type !== 'EC' || usecase.subgraphSystemIds.length <= 2) return [];
  const pairKeys = new Set(
    usecase.subgraphPairs.map(pair =>
      unorderedPairKey(pair.sourceSubgraphSystemId, pair.destSubgraphSystemId),
    ),
  );
  const boundaries = new Map<string, LegacyEcBoundary>();
  const links = [
    ...input.graphSnapshot.overlayDataLinks,
    ...input.graphSnapshot.routableDataLinks,
    ...input.graphSnapshot.sessionEdits.deletedDataLinks,
  ];
  for (const link of links) {
    const pairKey = unorderedPairKey(
      link.sourceSubgraphSystemId,
      link.destSubgraphSystemId,
    );
    if (link.linkType !== DATA_LINK_TYPE.Ec || !pairKeys.has(pairKey)) continue;
    boundaries.set(pairKey, {
      pairKey,
      sourceSubgraphSystemId: link.sourceSubgraphSystemId,
      destSubgraphSystemId: link.destSubgraphSystemId,
    });
  }
  return [...boundaries.values()].sort(
    (left, right) =>
      left.sourceSubgraphSystemId - right.sourceSubgraphSystemId ||
      left.destSubgraphSystemId - right.destSubgraphSystemId,
  );
}

function storedEndpoints(usecase: UseCase): readonly [number, number] | null {
  const incoming = new Set(
    usecase.subgraphPairs.map(pair => pair.destSubgraphSystemId),
  );
  const outgoing = new Set(
    usecase.subgraphPairs.map(pair => pair.sourceSubgraphSystemId),
  );
  const starts = usecase.subgraphSystemIds.filter(id => !incoming.has(id));
  const ends = usecase.subgraphSystemIds.filter(id => !outgoing.has(id));
  return starts.length === 1 && ends.length === 1 ? [starts[0], ends[0]] : null;
}

function blockedLegacyBoundaries(
  input: RoutingInput,
  usecase: UseCase,
  baselineBySubgraph: ReadonlyMap<number, readonly SgkvEntry[]>,
  selectedValueSystemIds: ReadonlySet<number>,
): ReadonlySet<string> {
  const blocked = new Set<string>();
  for (const boundary of legacyEcBoundaries(input, usecase)) {
    const sourceRequested = requestedSgkvSet(
      input,
      boundary.sourceSubgraphSystemId,
    );
    const destinationRequested = requestedSgkvSet(
      input,
      boundary.destSubgraphSystemId,
    );
    if (sourceRequested === null || destinationRequested === null) {
      blocked.add(boundary.pairKey);
      continue;
    }
    const sourceBaseline = filteredBaselineSgkvSet(
      baselineBySubgraph.get(boundary.sourceSubgraphSystemId) ?? [],
      selectedValueSystemIds,
    );
    const destinationBaseline = filteredBaselineSgkvSet(
      baselineBySubgraph.get(boundary.destSubgraphSystemId) ?? [],
      selectedValueSystemIds,
    );
    if (
      !sameCanonicalSgkvSets(sourceRequested, sourceBaseline) ||
      !sameCanonicalSgkvSets(destinationRequested, destinationBaseline)
    ) {
      blocked.add(boundary.pairKey);
    }
  }
  return blocked;
}

function sortedPaths(paths: readonly DfsPath[]): readonly DfsPath[] {
  return [...paths].sort((left, right) => {
    const length = Math.min(
      left.subgraphSystemIds.length,
      right.subgraphSystemIds.length,
    );
    for (let index = 0; index < length; index += 1) {
      const difference =
        left.subgraphSystemIds[index] - right.subgraphSystemIds[index];
      if (difference !== 0) return difference;
    }
    return left.subgraphSystemIds.length - right.subgraphSystemIds.length;
  });
}

function boundedPaths(
  adjacency: ReadonlyMap<number, readonly DirectedEdge[]>,
  start: number,
  end: number,
  allowed: ReadonlySet<number>,
  blockedEcPairKeys: ReadonlySet<string>,
): readonly DfsPath[] {
  if (!allowed.has(start) || !allowed.has(end)) return [];
  const paths: DfsPath[] = [];
  const path = [start];
  const visited = new Set([start]);
  const visit = (current: number): void => {
    if (current === end) {
      paths.push({
        subgraphSystemIds: [...path],
        termination: 'NATURAL_LEAF',
        ecBoundaryLinkId: null,
      });
      return;
    }
    if (path.length >= Math.max(allowed.size, 1)) return;
    const edges = [...(adjacency.get(current) ?? [])].sort(
      (left, right) =>
        left.destSubgraphSystemId - right.destSubgraphSystemId ||
        Number(left.isEc) - Number(right.isEc),
    );
    for (const edge of edges) {
      const next = edge.destSubgraphSystemId;
      if (
        visited.has(next) ||
        !allowed.has(next) ||
        (edge.isEc && blockedEcPairKeys.has(unorderedPairKey(current, next)))
      ) {
        continue;
      }
      visited.add(next);
      path.push(next);
      visit(next);
      path.pop();
      visited.delete(next);
    }
  };
  visit(start);
  return sortedPaths(paths);
}

/**
 * Adds bounded automatic successor paths to ordinary deletion decisions.
 *
 * It never mutates or persists the deleted UseCase. Manual routing bypasses reconstruction,
 * while automatic routing uses the Phase 2 adjacency and the limited legacy SGKV lookup to
 * block invalid EC-boundary paths.
 */
export class DeletionReconstructionService {
  async run(
    request: DeletionReconstructionRequest,
    subgraphRepository: SubgraphRepository,
  ): Promise<ResultType<readonly UsecaseTopologyDecision[]>> {
    if (request.input.mode === ROUTING_MODE.Manual) {
      return Result.ok(request.decisions);
    }

    const reconstructionDecisions = request.decisions.filter(
      (decision): decision is DeleteOrReconstructDecision =>
        decision.kind === 'DELETE_OR_RECONSTRUCT',
    );
    const legacyEndpointIds = [
      ...new Set(
        reconstructionDecisions.flatMap(decision =>
          legacyEcBoundaries(request.input, decision.usecase).flatMap(
            boundary => [
              boundary.sourceSubgraphSystemId,
              boundary.destSubgraphSystemId,
            ],
          ),
        ),
      ),
    ].sort((left, right) => left - right);
    const baselineEntries =
      legacyEndpointIds.length === 0
        ? []
        : await subgraphRepository.getSgkvs(
            request.input.fileSystemId,
            legacyEndpointIds,
          );
    const baselineBySubgraph = new Map<number, SgkvEntry[]>();
    for (const entry of baselineEntries) {
      const entries = baselineBySubgraph.get(entry.sgSystemId) ?? [];
      entries.push(entry);
      baselineBySubgraph.set(entry.sgSystemId, entries);
    }
    const deletedIds = new Set(
      reconstructionDecisions.map(decision => decision.usecase.systemId),
    );
    const selectedValueSystemIds = new Set(
      request.input.selectedUsecases
        .filter(usecase => !deletedIds.has(usecase.systemId))
        .flatMap(usecase => usecase.keyVector.valueSystemIds),
    );

    const reconstructed = request.decisions.map(decision => {
      if (decision.kind !== 'DELETE_OR_RECONSTRUCT') return decision;
      const endpoints = storedEndpoints(decision.usecase);
      if (endpoints === null) return decision;
      const blocked = blockedLegacyBoundaries(
        request.input,
        decision.usecase,
        baselineBySubgraph,
        selectedValueSystemIds,
      );
      const paths = boundedPaths(
        request.inventory.routableAdjacency,
        endpoints[0],
        endpoints[1],
        new Set(request.inventory.routingSubgraphsById.keys()),
        blocked,
      );
      return {...decision, reconstructionPaths: paths};
    });
    return Result.ok(reconstructed);
  }
}
