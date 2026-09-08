/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {FilterExpression} from '../../shared/filter/filter-expression.js';
import {IssueFactory} from '../../shared/issues/factories.js';
import {Result, type Result as ArcResult} from '../shared/result/result.js';
import type {SubsystemReadModel} from '../ports/persistence/query-services/subsystem/subsystem-read-model.js';
import type {KeyValuePairReadModel} from '../ports/persistence/query-services/usecase/query-models/key-vector-read-model.js';
import type {UseCaseReadModel} from '../ports/persistence/query-services/usecase/query-models/usecase-read-model.js';

/** Minimal module topology required by the subsystem-filtered algorithm. */
export interface SubsystemFilteredModule {
  readonly systemId: number;
  readonly parentSystemId?: number;
  readonly moduleNaturalId: number;
  readonly subgraphSystemId: number;
  readonly containerSystemId: number;
}

export interface UsecaseFilteredGkvData {
  readonly usecases: readonly UseCaseReadModel[];
  readonly subgraphSystemIdsByUsecase: ReadonlyMap<number, readonly number[]>;
  /** Maps subgraph system IDs to their natural subgraph IDs. */
  readonly subgraphNaturalIdsBySystemId: ReadonlyMap<number, number>;
  readonly subsystems: readonly SubsystemReadModel[];
  readonly modules: readonly SubsystemFilteredModule[];
}

/**
 * Minimal subsystem projection returned with a filtered-GKV group.
 *
 * This is intentionally separate from SubsystemReadModel because the
 * algorithm only exposes the subsystem natural ID and name. Reusing the full
 * read model would leak topology and filtered-key persistence fields into the
 * response, while depending on the API DTO would couple this core service to
 * the transport layer.
 */
export interface SubsystemReferenceReadModel {
  readonly subsystemNaturalId: number;
  readonly name: string;
}

export interface SubsystemFilteredGkvGroup {
  readonly keyValuePairs: KeyValuePairReadModel[];
  readonly subsystems: SubsystemReferenceReadModel[];
  readonly usecaseSystemIds: number[];
}

type UsecaseTopology = {
  subgraphNaturalIds: Set<number>;
  subsystemNaturalIds: Set<number>;
  modules: SubsystemFilteredModule[];
  ancestors: Set<number>;
  moduleAncestors: Set<number>[];
};

type TopologyIndexes = {
  subsystemSystemIds: Set<number>;
  parentBySubsystem: Map<number, number | undefined>;
  naturalIdBySubsystem: Map<number, number>;
  modulesBySubgraph: Map<number, SubsystemFilteredModule[]>;
};

/** Applies subsystem-filtered GKV business rules to effective read-side data. */
export class SubsystemFilteredGkvService {
  buildFilteredGkv(
    data: UsecaseFilteredGkvData,
    filter?: FilterExpression,
  ): ArcResult<SubsystemFilteredGkvGroup[]> {
    const subsystemBySystemId = new Map(
      data.subsystems.map(subsystem => [subsystem.systemId, subsystem]),
    );
    const topologyByUsecase = this.buildTopology(data);
    const knownSubsystemIds = new Set(
      data.subsystems.flatMap(subsystem =>
        subsystem.subsystemNaturalId === undefined
          ? []
          : [subsystem.subsystemNaturalId],
      ),
    );
    const invalidSubsystemId = filter
      ? findInvalidSubsystemId(filter, knownSubsystemIds)
      : null;
    if (invalidSubsystemId !== null) {
      return Result.fail(
        IssueFactory.parseError(
          'INVALID_FILTER_VALUE',
          `Filter references unknown subsystemId: ${invalidSubsystemId}`,
        ),
      );
    }

    const groups = new Map<string, SubsystemFilteredGkvGroup>();
    for (const usecase of data.usecases) {
      const topology =
        topologyByUsecase.get(usecase.systemId) ?? emptyTopology();
      if (filter && !evaluateFilter(filter, topology)) continue;

      const filtered = this.computeFilteredGkv(
        usecase,
        topology,
        subsystemBySystemId,
      );
      const groupKey = makeGroupKey(
        filtered.keyValuePairs,
        filtered.subsystems,
      );
      const group = groups.get(groupKey);
      if (group) {
        group.usecaseSystemIds.push(usecase.systemId);
      } else {
        groups.set(groupKey, {
          keyValuePairs: filtered.keyValuePairs,
          subsystems: filtered.subsystems,
          usecaseSystemIds: [usecase.systemId],
        });
      }
    }
    return Result.ok([...groups.values()]);
  }

  private buildTopology(
    data: UsecaseFilteredGkvData,
  ): Map<number, UsecaseTopology> {
    const indexes = createTopologyIndexes(data);
    return new Map(
      data.usecases.map(usecase => [
        usecase.systemId,
        buildUsecaseTopology(usecase, data, indexes),
      ]),
    );
  }

  private computeFilteredGkv(
    usecase: UseCaseReadModel,
    topology: UsecaseTopology,
    subsystemBySystemId: Map<number, SubsystemReadModel>,
  ): Pick<SubsystemFilteredGkvGroup, 'keyValuePairs' | 'subsystems'> {
    const topLevelBySubsystem = getTopLevelSubsystems(
      topology.ancestors,
      subsystemBySystemId,
    );
    const hierarchyRoot = hasSingleHierarchyRoot(topology, topLevelBySubsystem)
      ? [...topLevelBySubsystem.values()][0]
      : undefined;
    const keysToRemove = new Set<number>();
    const displaySubsystemIds = new Set<number>();

    for (const subsystemSystemId of topology.ancestors) {
      const subsystem = subsystemBySystemId.get(subsystemSystemId);
      if (!subsystem) continue;
      const filteredKeyIds =
        subsystem.filteredKeySystemIds ??
        subsystem.filteredKeys.map(key => key.systemId);
      if (filteredKeyIds.length === 0) continue;

      const matches = usecase.gkv.some(pair =>
        filteredKeyIds.includes(pair.key.systemId),
      );
      if (!matches || subsystemSystemId === hierarchyRoot) continue;

      for (const keyId of filteredKeyIds) keysToRemove.add(keyId);
      const topLevelId = topLevelBySubsystem.get(subsystemSystemId);
      if (topLevelId !== undefined) displaySubsystemIds.add(topLevelId);
    }

    const keyValuePairs = usecase.gkv.filter(
      pair => !keysToRemove.has(pair.key.systemId),
    );
    const subsystems = [...displaySubsystemIds].flatMap(systemId => {
      const subsystem = subsystemBySystemId.get(systemId);
      if (!subsystem || subsystem.subsystemNaturalId === undefined) return [];
      return [
        {
          subsystemNaturalId: subsystem.subsystemNaturalId,
          name: subsystem.name,
        },
      ];
    });

    return {keyValuePairs, subsystems};
  }
}

function createTopologyIndexes(data: UsecaseFilteredGkvData): TopologyIndexes {
  const modulesBySubgraph = new Map<number, SubsystemFilteredModule[]>();
  for (const module of data.modules) {
    const bucket = modulesBySubgraph.get(module.subgraphSystemId) ?? [];
    bucket.push(module);
    modulesBySubgraph.set(module.subgraphSystemId, bucket);
  }

  return {
    subsystemSystemIds: new Set(
      data.subsystems.map(subsystem => subsystem.systemId),
    ),
    parentBySubsystem: new Map(
      data.subsystems.map(subsystem => [
        subsystem.systemId,
        subsystem.parentSystemId,
      ]),
    ),
    naturalIdBySubsystem: new Map(
      data.subsystems.flatMap(subsystem =>
        subsystem.subsystemNaturalId === undefined
          ? []
          : [[subsystem.systemId, subsystem.subsystemNaturalId] as const],
      ),
    ),
    modulesBySubgraph,
  };
}

function buildUsecaseTopology(
  usecase: UseCaseReadModel,
  data: UsecaseFilteredGkvData,
  indexes: TopologyIndexes,
): UsecaseTopology {
  const subgraphSystemIds = new Set(
    data.subgraphSystemIdsByUsecase.get(usecase.systemId) ?? [],
  );
  const subgraphNaturalIds = new Set(
    [...subgraphSystemIds].flatMap(systemId => {
      const naturalId = data.subgraphNaturalIdsBySystemId.get(systemId);
      return naturalId === undefined ? [] : [naturalId];
    }),
  );
  const modules = [...subgraphSystemIds].flatMap(
    systemId => indexes.modulesBySubgraph.get(systemId) ?? [],
  );
  const ancestry = collectModuleAncestry(modules, indexes);

  return {
    subgraphNaturalIds,
    subsystemNaturalIds: ancestry.subsystemNaturalIds,
    modules,
    ancestors: ancestry.ancestors,
    moduleAncestors: ancestry.moduleAncestors,
  };
}

function collectModuleAncestry(
  modules: readonly SubsystemFilteredModule[],
  indexes: TopologyIndexes,
): Pick<
  UsecaseTopology,
  'ancestors' | 'subsystemNaturalIds' | 'moduleAncestors'
> {
  const ancestors = new Set<number>();
  const subsystemNaturalIds = new Set<number>();
  const moduleAncestors = modules.map(module =>
    collectAncestorsForModule(module, indexes, ancestors, subsystemNaturalIds),
  );

  return {ancestors, subsystemNaturalIds, moduleAncestors};
}

function collectAncestorsForModule(
  module: SubsystemFilteredModule,
  indexes: TopologyIndexes,
  ancestors: Set<number>,
  subsystemNaturalIds: Set<number>,
): Set<number> {
  let current = module.parentSystemId;
  const visited = new Set<number>();
  const ancestorsForModule = new Set<number>();

  while (current != null && !visited.has(current)) {
    visited.add(current);
    if (indexes.subsystemSystemIds.has(current)) {
      ancestors.add(current);
      ancestorsForModule.add(current);
      const naturalId = indexes.naturalIdBySubsystem.get(current);
      if (naturalId !== undefined) subsystemNaturalIds.add(naturalId);
    }
    current = indexes.parentBySubsystem.get(current);
  }

  return ancestorsForModule;
}

function emptyTopology(): UsecaseTopology {
  return {
    subgraphNaturalIds: new Set(),
    subsystemNaturalIds: new Set(),
    modules: [],
    ancestors: new Set(),
    moduleAncestors: [],
  };
}

function findInvalidSubsystemId(
  expression: FilterExpression,
  knownIds: Set<number>,
): number | null {
  if (expression.type !== 'condition') {
    return (
      findInvalidSubsystemId(expression.left, knownIds) ??
      findInvalidSubsystemId(expression.right, knownIds)
    );
  }
  if (expression.field !== 'subsystemId') return null;
  const id = numericValue(expression.value);
  return id !== null && knownIds.has(id) ? null : (id ?? Number.NaN);
}

function evaluateFilter(
  expression: FilterExpression,
  topology: UsecaseTopology,
): boolean {
  if (expression.type === 'AND') {
    return (
      evaluateFilter(expression.left, topology) &&
      evaluateFilter(expression.right, topology)
    );
  }
  if (expression.type === 'OR') {
    return (
      evaluateFilter(expression.left, topology) ||
      evaluateFilter(expression.right, topology)
    );
  }

  const value = numericValue(expression.value);
  if (value === null) return false;
  switch (expression.field) {
    case 'subsystemId':
      return topology.subsystemNaturalIds.has(value);
    case 'subgraphNaturalId':
      return topology.subgraphNaturalIds.has(value);
    case 'spfModuleInstanceNaturalId':
      return topology.modules.some(module => module.moduleNaturalId === value);
    case 'containerNaturalId':
      return topology.modules.some(
        module => module.containerSystemId === value,
      );
    default:
      return false;
  }
}

function numericValue(value: number | string | boolean): number | null {
  if (typeof value === 'boolean') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getTopLevelSubsystems(
  ancestors: Set<number>,
  subsystemBySystemId: Map<number, SubsystemReadModel>,
): Map<number, number> {
  const result = new Map<number, number>();
  for (const subsystemSystemId of ancestors) {
    let current = subsystemSystemId;
    const visited = new Set<number>();
    while (!visited.has(current)) {
      visited.add(current);
      const parentId = subsystemBySystemId.get(current)?.parentSystemId;
      if (parentId == null || !ancestors.has(parentId)) break;
      current = parentId;
    }
    result.set(subsystemSystemId, current);
  }
  return result;
}

function hasSingleHierarchyRoot(
  topology: UsecaseTopology,
  topLevelBySubsystem: Map<number, number>,
): boolean {
  const topLevelIds = new Set(topLevelBySubsystem.values());
  if (topLevelIds.size !== 1 || topology.modules.length === 0) return false;
  const hierarchyRoot = [...topLevelIds][0];
  return topology.moduleAncestors.every(ancestors =>
    [...ancestors].some(
      subsystemSystemId =>
        topLevelBySubsystem.get(subsystemSystemId) === hierarchyRoot,
    ),
  );
}

function makeGroupKey(
  keyValuePairs: readonly KeyValuePairReadModel[],
  subsystems: readonly SubsystemReferenceReadModel[],
): string {
  // The reference algorithm uses sequence equality: pair and subsystem order
  // are significant.
  return JSON.stringify({
    keyValuePairs: keyValuePairs.map(pair => ({
      keySystemId: pair.key.systemId,
      keyNaturalId: pair.key.naturalId,
      valueSystemId: pair.value.systemId,
      valueNaturalId: pair.value.naturalId,
    })),
    subsystems,
  });
}
