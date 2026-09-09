/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {FilterExpression} from '../../shared/filter/filter-expression.js';
import {IssueFactory} from '../../shared/issues/factories.js';
import {Result, type Result as ArcResult} from '../shared/result/result.js';
import type {SubsystemReadModel} from '../ports/persistence/query-services/subsystem/subsystem-read-model.js';
import type {SpfModuleReadModel} from '../ports/persistence/query-services/spf-module/spf-module-read-model.js';
import type {KeyValuePairReadModel} from '../ports/persistence/query-services/usecase/query-models/key-vector-read-model.js';
import type {UseCaseReadModel} from '../ports/persistence/query-services/usecase/query-models/usecase-read-model.js';

export type SubsystemFilteredModule = Pick<
  SpfModuleReadModel,
  'systemId' | 'parentId' | 'instanceId' | 'subgraphId' | 'containerId'
>;

export interface UsecaseFilteredGkvData {
  readonly usecases: readonly UseCaseReadModel[];
  readonly subgraphSystemIdsByUsecase: ReadonlyMap<number, readonly number[]>;
  readonly subsystems: readonly SubsystemReadModel[];
  readonly modules: readonly SubsystemFilteredModule[];
}

export interface SubsystemFilteredGkvGroup {
  readonly filteredGkv: KeyValuePairReadModel[];
  readonly usecaseSystemIds: number[];
}

type UsecaseTopology = {
  subgraphs: Set<number>;
  modules: SubsystemFilteredModule[];
  ancestors: Set<number>;
  moduleAncestors: Set<number>[];
};

/** Applies subsystem-filtered GKV business rules to effective read-side data. */
export class SubsystemFilteredGkvService {
  buildFilteredGkv(
    data: UsecaseFilteredGkvData,
    filter?: FilterExpression,
  ): ArcResult<SubsystemFilteredGkvGroup[]> {
    const subsystemById = new Map(
      data.subsystems.map(subsystem => [subsystem.systemId, subsystem]),
    );
    const topologyByUsecase = this.buildTopology(data);
    const knownSubsystemIds = new Set(
      data.subsystems.map(subsystem => subsystem.systemId),
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
      const filteredGkv = this.computeFilteredGkv(
        usecase,
        topology,
        subsystemById,
      );
      const groupKey = makeGroupKey(filteredGkv);
      const group = groups.get(groupKey);
      if (group) group.usecaseSystemIds.push(usecase.systemId);
      else {
        groups.set(groupKey, {
          filteredGkv,
          usecaseSystemIds: [usecase.systemId],
        });
      }
    }
    return Result.ok([...groups.values()]);
  }

  private buildTopology(
    data: UsecaseFilteredGkvData,
  ): Map<number, UsecaseTopology> {
    const subsystemIds = new Set(
      data.subsystems.map(subsystem => subsystem.systemId),
    );
    const parentBySubsystem = new Map(
      data.subsystems.map(subsystem => [
        subsystem.systemId,
        subsystem.parentId,
      ]),
    );
    const modulesBySubgraph = new Map<number, SubsystemFilteredModule[]>();
    for (const module of data.modules) {
      const bucket = modulesBySubgraph.get(module.subgraphId) ?? [];
      bucket.push(module);
      modulesBySubgraph.set(module.subgraphId, bucket);
    }

    const result = new Map<number, UsecaseTopology>();
    for (const usecase of data.usecases) {
      const subgraphs = new Set(
        data.subgraphSystemIdsByUsecase.get(usecase.systemId) ?? [],
      );
      const modules = [...subgraphs].flatMap(
        id => modulesBySubgraph.get(id) ?? [],
      );
      const ancestors = new Set<number>();
      const moduleAncestors: Set<number>[] = [];
      for (const module of modules) {
        let current = module.parentId;
        const visited = new Set<number>();
        const ancestorsForModule = new Set<number>();
        while (current != null && !visited.has(current)) {
          visited.add(current);
          if (subsystemIds.has(current)) {
            ancestors.add(current);
            ancestorsForModule.add(current);
          }
          current = parentBySubsystem.get(current);
        }
        moduleAncestors.push(ancestorsForModule);
      }
      result.set(usecase.systemId, {
        subgraphs,
        modules,
        ancestors,
        moduleAncestors,
      });
    }
    return result;
  }

  private computeFilteredGkv(
    usecase: UseCaseReadModel,
    topology: UsecaseTopology,
    subsystemById: Map<number, SubsystemReadModel>,
  ): KeyValuePairReadModel[] {
    const topLevelBySubsystem = getTopLevelSubsystems(
      topology.ancestors,
      subsystemById,
    );
    const hierarchyRoot = hasSingleHierarchyRoot(topology, topLevelBySubsystem)
      ? [...topLevelBySubsystem.values()][0]
      : undefined;
    const keysToRemove = new Set<number>();
    const displaySubsystemIds = new Set<number>();

    for (const subsystemId of topology.ancestors) {
      const subsystem = subsystemById.get(subsystemId);
      if (!subsystem) continue;
      const filteredKeyIds =
        subsystem.filteredKeySystemIds ??
        subsystem.filteredKeys.map(key => key.systemId);
      if (filteredKeyIds.length === 0) continue;
      const matches = usecase.gkv.some(pair =>
        filteredKeyIds.includes(pair.key.systemId),
      );
      if (!matches || subsystemId === hierarchyRoot) continue;

      for (const keyId of filteredKeyIds) keysToRemove.add(keyId);
      const topLevelId = topLevelBySubsystem.get(subsystemId);
      if (topLevelId !== undefined) displaySubsystemIds.add(topLevelId);
    }

    const filteredGkv = usecase.gkv.filter(
      pair => !keysToRemove.has(pair.key.systemId),
    );
    for (const subsystemId of displaySubsystemIds) {
      const subsystem = subsystemById.get(subsystemId);
      if (!subsystem) continue;
      filteredGkv.push({
        key: {
          systemId: SUBSYSTEM_FILTERED_KEY_ID,
          keyId: SUBSYSTEM_FILTERED_KEY_ID,
          name: 'Subsystem',
        },
        value: {
          systemId: subsystem.systemId,
          valueId: subsystem.systemId,
          name: subsystem.name,
        },
      });
    }
    return filteredGkv;
  }
}

export const SUBSYSTEM_FILTERED_KEY_ID = 0xac_db_f1_00;

function emptyTopology(): UsecaseTopology {
  return {
    subgraphs: new Set(),
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
      return topology.ancestors.has(value);
    case 'subgraphId':
      return topology.subgraphs.has(value);
    case 'spfModuleInstanceId':
      return topology.modules.some(module => module.instanceId === value);
    case 'containerId':
      return topology.modules.some(module => module.containerId === value);
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
  subsystemById: Map<number, SubsystemReadModel>,
): Map<number, number> {
  const result = new Map<number, number>();
  for (const subsystemId of ancestors) {
    let current = subsystemId;
    const visited = new Set<number>();
    while (!visited.has(current)) {
      visited.add(current);
      const parentId = subsystemById.get(current)?.parentId;
      if (parentId == null || !ancestors.has(parentId)) break;
      current = parentId;
    }
    result.set(subsystemId, current);
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
      subsystemId => topLevelBySubsystem.get(subsystemId) === hierarchyRoot,
    ),
  );
}

function makeGroupKey(gkv: KeyValuePairReadModel[]): string {
  return [...gkv]
    .sort(
      (left, right) =>
        left.key.systemId - right.key.systemId ||
        left.value.systemId - right.value.systemId,
    )
    .map(pair => `${pair.key.systemId}:${pair.value.systemId}`)
    .join(',');
}
