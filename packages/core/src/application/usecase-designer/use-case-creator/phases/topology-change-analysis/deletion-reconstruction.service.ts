/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../../application/shared/result/result.js';
import type {
  SgkvEntry,
  SubgraphRepository,
} from '../../../../ports/persistence/repositories/subgraph/subgraph.repository.js';
import type {RoutingInput} from '../../contracts/routing-input.js';
import {ROUTING_MODE} from '../../contracts/routing-input.js';
import {
  USECASE_TOPOLOGY_DECISION_KIND,
  type DfsPath,
  type DeleteOrReconstructDecision,
  type UsecaseTopologyDecision,
} from '../../contracts/routing-state.js';
import {
  compareDirectedEdges,
  type DirectedEdge,
  type TopologyImpactInventory,
} from './topology-impact-inventory.js';
import {DATA_LINK_TYPE} from '../../../../../domain/entities/usecase-data/links/data-link-type.js';
import type {UseCase} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';
import {
  directedPairKey,
  unorderedPairKey,
} from '../../shared/usecase-topology.js';
import {logicalEcConnections} from '../../shared/logical-ec-connections.js';

export interface DeletionReconstructionRequest {
  readonly input: RoutingInput;
  readonly inventory: TopologyImpactInventory;
  readonly decisions: readonly UsecaseTopologyDecision[];
}

interface LegacyEcBoundary {
  readonly physicalPairKeys: readonly string[];
  readonly sourceSubgraphSystemId: number;
  readonly destSubgraphSystemId: number;
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

/**
 * Finds the logical EC crossing inside a legacy monolithic EC UseCase.
 *
 * Phase 2 uses this boundary in two places: first to batch-load SGKV baselines for only
 * the logical left/right endpoints, and then to decide whether bounded deletion
 * reconstruction may cross the EC connection. Unchanged endpoints leave the connection
 * traversable; changed or unavailable endpoints cause every physical EC pair in the
 * connection to be blocked. This special traversal is necessary because the normal DFS
 * intentionally stops at EC boundaries and therefore cannot recreate a legacy UC that
 * spans one.
 *
 * An empty result means the UseCase is not a legacy monolithic EC shape. In particular,
 * a new-scheme MDF Bridge may contain more than two SGs, but has no topology outside its
 * logical EC connection and must not be mistaken for a legacy UC.
 */
function legacyEcBoundaries(
  input: RoutingInput,
  usecase: UseCase,
): readonly LegacyEcBoundary[] {
  // Only EC UseCases can own the cross-EC legacy reconstruction exception.
  if (usecase.type !== 'EC') return [];

  // Limit discovery to directed pairs actually stored by this UseCase. Deleted links
  // remain relevant because Phase 2 must recognize the pre-edit EC boundary, while the
  // effective overlay wins when the same physical link appears in multiple catalogs.
  const usecasePairKeys = new Set(
    usecase.subgraphPairs.map(pair =>
      directedPairKey(pair.sourceSubgraphSystemId, pair.destSubgraphSystemId),
    ),
  );
  const linksById = new Map(
    [
      ...input.graphSnapshot.sessionEdits.deletedDataLinks,
      ...input.graphSnapshot.routableDataLinks,
      ...input.graphSnapshot.overlayDataLinks,
    ].map(link => [link.systemId, link]),
  );
  const ecLinks = [...linksById.values()].filter(
    link =>
      link.linkType === DATA_LINK_TYPE.Ec &&
      usecasePairKeys.has(
        directedPairKey(link.sourceSubgraphSystemId, link.destSubgraphSystemId),
      ),
  );

  // Collapse a direct EC link or an MDF-transparent EC chain into one logical crossing.
  // Rule C allows exactly one such crossing in a legacy EC UseCase.
  const connections = logicalEcConnections(
    ecLinks,
    input.graphSnapshot.mdfSubgraphSystemIds,
  );
  if (connections.length !== 1) return [];

  const connection = connections[0];

  // Legacy UCs contain the complete EC connection plus additional path topology on one
  // or both sides. Requiring that strict superset distinguishes them from new Bridges,
  // including multi-SG Bridges whose physical EC path passes through MDF members.
  const connectionMemberIds = new Set(connection.subgraphSystemIds);
  const connectionPairKeys = connection.subgraphSystemIds
    .slice(1)
    .map((destSubgraphSystemId, index) =>
      directedPairKey(
        connection.subgraphSystemIds[index],
        destSubgraphSystemId,
      ),
    );
  const containsCompleteConnection =
    [...connectionMemberIds].every(id =>
      usecase.subgraphSystemIds.includes(id),
    ) && connectionPairKeys.every(key => usecasePairKeys.has(key));
  const hasLegacyTopologyOutsideConnection =
    new Set(usecase.subgraphSystemIds).size > connectionMemberIds.size ||
    usecasePairKeys.size > new Set(connectionPairKeys).size;
  if (!containsCompleteConnection || !hasLegacyTopologyOutsideConnection)
    return [];

  // The bounded DFS compares relationships using unordered keys when deciding whether
  // an EC edge is blocked. Return every physical pair so one logical MDF chain is opened
  // or closed atomically, while SGKV comparison remains limited to its logical endpoints.
  return [
    {
      physicalPairKeys: connection.subgraphSystemIds
        .slice(1)
        .map((destSubgraphSystemId, index) =>
          unorderedPairKey(
            connection.subgraphSystemIds[index],
            destSubgraphSystemId,
          ),
        ),
      sourceSubgraphSystemId: connection.leftSubgraphSystemId,
      destSubgraphSystemId: connection.rightSubgraphSystemId,
    },
  ];
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
      for (const pairKey of boundary.physicalPairKeys) blocked.add(pairKey);
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
      for (const pairKey of boundary.physicalPairKeys) blocked.add(pairKey);
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
      compareDirectedEdges,
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
  ): Promise<Result<readonly UsecaseTopologyDecision[]>> {
    if (request.input.mode === ROUTING_MODE.Manual) {
      return Result.ok(request.decisions);
    }

    const reconstructionDecisions = request.decisions.filter(
      (decision): decision is DeleteOrReconstructDecision =>
        decision.kind === USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
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
      if (decision.kind !== USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct)
        return decision;
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
