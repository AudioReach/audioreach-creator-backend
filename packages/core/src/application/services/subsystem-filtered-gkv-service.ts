/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {FilterExpression} from '../../shared/filter/filter-expression.js';
import {IssueFactory} from '../../shared/issues/factories.js';
import {
  RESULT_KIND,
  Result,
  type Result as ArcResult,
} from '../shared/result/result.js';
import type {KeyDefinitionSummaryReadModel} from '../ports/persistence/query-services/key-value/key-value-definition-read-model.js';
import type {KeyValuePairReadModel} from '../ports/persistence/query-services/usecase/query-models/key-vector-read-model.js';
import type {UseCaseReadModel} from '../ports/persistence/query-services/usecase/query-models/usecase-read-model.js';
import type {UseCaseQueryService} from '../ports/persistence/query-services/usecase/usecase-query-service.js';

/** Minimal module topology required by the subsystem-filtered algorithm. */
export interface SubsystemFilteredModule {
  readonly systemId: number;
  readonly parentSystemId?: number;
  readonly moduleNaturalId: number;
  readonly subgraphSystemId: number;
  readonly containerNaturalId: number;
}

/** Minimal subsystem topology required by the subsystem-filtered algorithm. */
export interface SubsystemFilterEntry {
  readonly systemId: number;
  readonly naturalId: number;
  readonly name: string;
  readonly parentSystemId: number | null;
  readonly filteredKeys: KeyDefinitionSummaryReadModel[];
}

/** Minimal topology required to select usecases before loading their GKVs. */
export interface UsecaseFilteredTopologyData {
  readonly usecaseSystemIds: readonly number[];
  readonly subgraphSystemIdsByUsecase: ReadonlyMap<number, readonly number[]>;
  readonly subgraphNaturalIdsBySystemId: ReadonlyMap<number, number>;
  readonly subsystems: readonly SubsystemFilterEntry[];
  readonly modules: readonly SubsystemFilteredModule[];
}

export interface UsecaseFilteredGkvData {
  readonly usecases: readonly UseCaseReadModel[];
  readonly subgraphSystemIdsByUsecase: ReadonlyMap<number, readonly number[]>;
  /** Maps subgraph system IDs to their natural subgraph IDs. */
  readonly subgraphNaturalIdsBySystemId: ReadonlyMap<number, number>;
  readonly subsystems: readonly SubsystemFilterEntry[];
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
  readonly usecases: UseCaseReadModel[];
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
  constructor(private readonly useCaseQueryService: UseCaseQueryService) {}

  async resolveFilteredGroups(
    fileId: number,
    filter?: FilterExpression,
  ): Promise<ArcResult<SubsystemFilteredGkvGroup[]>> {
    const topologyResult =
      await this.useCaseQueryService.getUsecaseFilteredTopologyData(fileId);
    if (topologyResult.kind === RESULT_KIND.Fail) return topologyResult;

    const matchingIdsResult = this.findMatchingUsecaseIds(
      topologyResult.data,
      filter,
    );
    if (matchingIdsResult.kind === RESULT_KIND.Fail) return matchingIdsResult;

    const usecasesResult = await this.useCaseQueryService.getUsecasesWithGkv(
      fileId,
      matchingIdsResult.data,
    );
    if (usecasesResult.kind === RESULT_KIND.Fail) return usecasesResult;

    const topology = topologyResult.data;
    const gkvData: UsecaseFilteredGkvData = {
      usecases: usecasesResult.data,
      subgraphSystemIdsByUsecase: new Map(
        matchingIdsResult.data.map(id => [
          id,
          topology.subgraphSystemIdsByUsecase.get(id) ?? [],
        ]),
      ),
      subgraphNaturalIdsBySystemId: topology.subgraphNaturalIdsBySystemId,
      subsystems: topology.subsystems,
      modules: topology.modules,
    };

    const groupsResult = this.buildFilteredGkv(gkvData, filter);
    if (groupsResult.kind === RESULT_KIND.Fail) return groupsResult;

    return usecasesResult.kind === RESULT_KIND.Partial
      ? Result.partial(groupsResult.data, usecasesResult.issues)
      : groupsResult;
  }

  findMatchingUsecaseIds(
    data: UsecaseFilteredTopologyData,
    filter?: FilterExpression,
  ): ArcResult<number[]> {
    const topologyByUsecase = this.buildTopologyForIds(
      data.usecaseSystemIds,
      data,
    );
    const knownSubsystemIds = new Set(
      data.subsystems.map(subsystem => subsystem.naturalId),
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

    return Result.ok(
      data.usecaseSystemIds.filter(usecaseSystemId => {
        const topology =
          topologyByUsecase.get(usecaseSystemId) ?? emptyTopology();
        return !filter || evaluateFilter(filter, topology);
      }),
    );
  }

  buildFilteredGkv(
    data: UsecaseFilteredGkvData,
    filter?: FilterExpression,
  ): ArcResult<SubsystemFilteredGkvGroup[]> {
    const subsystemBySystemId = new Map(
      data.subsystems.map(subsystem => [subsystem.systemId, subsystem]),
    );
    const topologyByUsecase = this.buildTopology(data);
    const knownSubsystemIds = new Set(
      data.subsystems.map(subsystem => subsystem.naturalId),
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
        group.usecases.push(usecase);
      } else {
        groups.set(groupKey, {
          keyValuePairs: filtered.keyValuePairs,
          subsystems: filtered.subsystems,
          usecases: [usecase],
        });
      }
    }
    return Result.ok([...groups.values()]);
  }

  private buildTopology(
    data: UsecaseFilteredGkvData,
  ): Map<number, UsecaseTopology> {
    return this.buildTopologyForIds(
      data.usecases.map(usecase => usecase.systemId),
      data,
    );
  }

  private buildTopologyForIds(
    usecaseSystemIds: readonly number[],
    data: UsecaseFilteredTopologyData | UsecaseFilteredGkvData,
  ): Map<number, UsecaseTopology> {
    const indexes = createTopologyIndexes(data);
    return new Map(
      usecaseSystemIds.map(usecaseSystemId => [
        usecaseSystemId,
        buildUsecaseTopology(usecaseSystemId, data, indexes),
      ]),
    );
  }

  private computeFilteredGkv(
    usecase: UseCaseReadModel,
    topology: UsecaseTopology,
    subsystemBySystemId: Map<number, SubsystemFilterEntry>,
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
      const filteredKeyIds = subsystem.filteredKeys.map(key => key.systemId);
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
      if (!subsystem) return [];
      return [
        {
          subsystemNaturalId: subsystem.naturalId,
          name: subsystem.name,
        },
      ];
    });

    return {keyValuePairs, subsystems};
  }
}

function createTopologyIndexes(
  data: UsecaseFilteredTopologyData | UsecaseFilteredGkvData,
): TopologyIndexes {
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
        subsystem.parentSystemId ?? undefined,
      ]),
    ),
    naturalIdBySubsystem: new Map(
      data.subsystems.map(subsystem => [
        subsystem.systemId,
        subsystem.naturalId,
      ]),
    ),
    modulesBySubgraph,
  };
}

function buildUsecaseTopology(
  usecaseSystemId: number,
  data: UsecaseFilteredTopologyData | UsecaseFilteredGkvData,
  indexes: TopologyIndexes,
): UsecaseTopology {
  const subgraphSystemIds = new Set(
    data.subgraphSystemIdsByUsecase.get(usecaseSystemId) ?? [],
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
        module => module.containerNaturalId === value,
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
  subsystemBySystemId: Map<number, SubsystemFilterEntry>,
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
