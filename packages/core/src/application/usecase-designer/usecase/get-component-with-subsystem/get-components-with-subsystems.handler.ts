/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {ComponentsWithSubsystemsReadModel} from './components-with-subsystems-read-model.js';
import type {ComponentsReadModel} from '../../../ports/persistence/query-services/usecase/query-models/components-read-model.js';
import type {DataLinkReadModel} from '../../../ports/persistence/query-services/link/data-link-read-model.js';
import type {ControlLinkReadModel} from '../../../ports/persistence/query-services/link/control-link-read-model.js';
import {Result, RESULT_KIND} from '../../../shared/result/result.js';
import {GetComponentsWithSubsystemsQuery} from './get-components-with-subsystems.query.js';
import {buildSubsystemTree} from './build-subsystem-tree.js';
import type {ComponentCollectionWithSubsystemsDto} from '../dto/component-collection-dto.js';
import {mapComponentCollectionWithSubsystems} from '../dto/component-collection-dto.js';

export class GetComponentsWithSubsystemsHandler implements QueryHandler<
  GetComponentsWithSubsystemsQuery,
  Promise<Result<ComponentCollectionWithSubsystemsDto>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetComponentsWithSubsystemsQuery,
  ): Promise<Result<ComponentCollectionWithSubsystemsDto>> {
    const fileId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    // Validate all usecase IDs exist (DB or session via getAllUseCases overlay)
    const allUsecasesResult =
      await this.queryServices.useCaseQueryService.getAllUseCases(fileId);
    if (allUsecasesResult.kind === RESULT_KIND.Fail)
      throw new Error(
        allUsecasesResult.issues[0]?.message ?? 'Failed to load usecases',
      );

    const knownIds = new Set(allUsecasesResult.data.map(uc => uc.systemId));
    const invalidId = query.scope.systemIds.find(id => !knownIds.has(id));
    if (invalidId !== undefined)
      throw new Error(`UseCase ${invalidId} not found`);

    const svc = this.queryServices;
    const systemIds = query.scope.systemIds;

    // Pass 1: load modules and subsystems in parallel.
    // Subsystem presence determines whether virtual boundary segments are needed.
    const [modulesResult, subsystemsResult] = await Promise.all([
      svc.spfModuleQueryService.findByUsecaseIds(systemIds, fileId),
      svc.subsystemQueryService.findAll(fileId),
    ]);

    if (modulesResult.kind === RESULT_KIND.Fail)
      throw new Error(
        modulesResult.issues[0]?.message ?? 'Failed to load modules',
      );
    if (subsystemsResult.kind === RESULT_KIND.Fail)
      throw new Error(
        subsystemsResult.issues[0]?.message ?? 'Failed to load subsystems',
      );

    const hasSubsystems = subsystemsResult.data.length > 0;

    // Pass 2a: always load raw links in parallel (source of truth for all connections — QWS-04).
    const [rawDataLinksResult, rawControlLinksResult] = await Promise.all([
      svc.dataLinkQueryService.findByUsecaseIds(systemIds, fileId),
      svc.controlLinkQueryService.findByUsecaseIds(systemIds, fileId),
    ]);

    if (rawDataLinksResult.kind === RESULT_KIND.Fail)
      throw new Error(
        rawDataLinksResult.issues[0]?.message ?? 'Failed to load data links',
      );
    if (rawControlLinksResult.kind === RESULT_KIND.Fail)
      throw new Error(
        rawControlLinksResult.issues[0]?.message ??
          'Failed to load control links',
      );

    // Build subsystem ID set to identify boundary-crossing virtual segments.
    // A virtual segment is boundary-crossing when one endpoint is a subsystem node (not a module).
    // Raw links cover non-boundary connections (no virtual segment exists for them).
    // Boundary-crossing raw links are naturally dropped by levelNodeIds in buildSubsystemTree.
    const subsystemIds = new Set(subsystemsResult.data.map(s => s.systemId));

    // Pass 2b: when subsystems exist, load virtual boundary segments and add to combined list.
    // Serial dependency on hasSubsystems is intentional — cannot be known before Pass 1.
    const extraDataLinks: DataLinkReadModel[] = [];
    const extraControlLinks: ControlLinkReadModel[] = [];

    if (hasSubsystems) {
      const [vDataResult, vControlResult] = await Promise.all([
        svc.subsystemQueryService.findDataLinkSegmentsByUsecaseIds(
          systemIds,
          fileId,
        ),
        svc.subsystemQueryService.findControlLinkSegmentsByUsecaseIds(
          systemIds,
          fileId,
        ),
      ]);
      if (vDataResult.kind === RESULT_KIND.Fail)
        throw new Error(
          vDataResult.issues[0]?.message ?? 'Failed to load virtual data links',
        );
      if (vControlResult.kind === RESULT_KIND.Fail)
        throw new Error(
          vControlResult.issues[0]?.message ??
            'Failed to load virtual control links',
        );

      extraDataLinks.push(
        ...vDataResult.data.filter(
          dl =>
            subsystemIds.has(dl.sourceNodeSystemId) ||
            subsystemIds.has(dl.destinationNodeSystemId),
        ),
      );
      extraControlLinks.push(
        ...vControlResult.data.filter(
          cl =>
            subsystemIds.has(cl.peerNodeASystemId) ||
            subsystemIds.has(cl.peerNodeBSystemId),
        ),
      );
    }

    const flat: ComponentsReadModel = {
      modules: modulesResult.data,
      dataLinks: [...rawDataLinksResult.data, ...extraDataLinks],
      controlLinks: [...rawControlLinksResult.data, ...extraControlLinks],
    };
    const tree: ComponentsWithSubsystemsReadModel = buildSubsystemTree(
      flat,
      subsystemsResult.data,
    );

    return Result.ok(mapComponentCollectionWithSubsystems(tree));
  }
}
