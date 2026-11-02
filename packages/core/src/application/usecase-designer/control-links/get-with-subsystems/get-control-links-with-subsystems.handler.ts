/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {SubsystemReadModel} from '../../../ports/persistence/query-services/subsystem/subsystem-read-model.js';
import type {ControlLinkReadModel} from '../../../ports/persistence/query-services/link/control-link-read-model.js';
import type {ComponentsWithSubsystemsReadModel} from '../../usecase/get-component-with-subsystem/components-with-subsystems-read-model.js';
import {Result, RESULT_KIND} from '../../../shared/result/result.js';
import {mapComponentCollectionWithSubsystems} from '../../usecase/dto/component-collection-dto.js';
import type {ComponentCollectionWithSubsystemsDto} from '../../usecase/dto/component-collection-dto.js';
import type {GetControlLinksWithSubsystemsQuery} from './get-control-links-with-subsystems.query.js';

export class GetControlLinksWithSubsystemsHandler implements QueryHandler<
  GetControlLinksWithSubsystemsQuery,
  Promise<Result<ComponentCollectionWithSubsystemsDto>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetControlLinksWithSubsystemsQuery,
  ): Promise<Result<ComponentCollectionWithSubsystemsDto>> {
    const fileId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    const [subsystemsResult, segmentsResult] = await Promise.all([
      this.queryServices.subsystemQueryService.findAll(fileId),
      this.queryServices.subsystemQueryService.findControlLinkSegments(
        fileId,
        query.linkSystemId,
      ),
    ]);

    if (subsystemsResult.kind === RESULT_KIND.Fail)
      throw new Error(
        subsystemsResult.issues[0]?.message ?? 'Failed to load subsystems',
      );
    if (segmentsResult.kind === RESULT_KIND.Fail)
      throw new Error(
        segmentsResult.issues[0]?.message ??
          'Failed to load control link segments',
      );

    const tree = buildSubsystemControlLinkTree(
      subsystemsResult.data,
      segmentsResult.data,
    );

    return Result.ok(mapComponentCollectionWithSubsystems(tree));
  }
}

/**
 * Builds a recursive subsystem tree from subsystems and SCS segments.
 * Modules are not included in the output but their IDs (from SubsystemReadModel.moduleSystemIds)
 * are used as invisible routing nodes so non-boundary SCS are placed at the correct level.
 * All subsystems are included — no module-based pruning.
 */
function buildSubsystemControlLinkTree(
  subsystems: SubsystemReadModel[],
  segments: ControlLinkReadModel[],
): ComponentsWithSubsystemsReadModel {
  const subsystemById = new Map(subsystems.map(s => [s.systemId, s]));
  const childrenOf = new Map<number | null, number[]>();

  for (const sub of subsystems) {
    const key = sub.parentSystemId;
    const siblings = childrenOf.get(key) ?? [];
    siblings.push(sub.systemId);
    childrenOf.set(key, siblings);
  }

  const buildLevel = (
    parentSystemId: number | null,
    visited: Set<number>,
  ): ComponentsWithSubsystemsReadModel => {
    const directChildIds = childrenOf.get(parentSystemId) ?? [];

    // Include module IDs of the current subsystem as routing nodes so
    // non-boundary SCS (both endpoints are modules inside this subsystem)
    // are placed at the correct tree level.
    const moduleIds =
      parentSystemId !== null
        ? (subsystemById.get(parentSystemId)?.moduleSystemIds ?? [])
        : [];

    const levelNodeIds = new Set<number>([
      ...moduleIds,
      ...directChildIds,
      ...(parentSystemId !== null ? [parentSystemId] : []),
    ]);

    const levelControlLinks = segments.filter(
      cl =>
        levelNodeIds.has(cl.peerNodeASystemId) &&
        levelNodeIds.has(cl.peerNodeBSystemId),
    );

    const subsystemNodes = directChildIds.flatMap(id => {
      if (visited.has(id)) return [];
      const sub = subsystemById.get(id);
      if (!sub) return [];
      const nextVisited = new Set(visited);
      nextVisited.add(id);
      return [
        {
          systemId: sub.systemId,
          naturalId: sub.naturalId,
          name: sub.name,
          dataPorts: sub.dataPorts,
          controlPorts: sub.controlPorts,
          filteredKeys: sub.filteredKeys,
          children: buildLevel(sub.systemId, nextVisited),
        },
      ];
    });

    return {
      modules: [],
      dataLinks: [],
      controlLinks: levelControlLinks,
      subsystems: subsystemNodes,
      subsystemDataLinks: [],
    };
  };

  return buildLevel(null, new Set());
}
