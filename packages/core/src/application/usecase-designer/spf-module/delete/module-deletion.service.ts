/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {DomainRuleViolationException} from '../../../../shared/exceptions/domain-rule-violation.exception.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import {DataLinkDeletionService} from '../../data-links/delete/data-link-deletion.service.js';
import {ControlLinkDeletionService} from '../../control-links/delete/control-link-deletion.service.js';
import {ContainerLifecycleService} from '../../container/delete/container-lifecycle.service.js';
import {ContainerStackSizeService} from '../../container/services/container-stack-size.service.js';
import {SubgraphLifecycleService} from '../../subgraph/delete/subgraph-lifecycle.service.js';
import type {DeleteSpfModuleResult} from '../dto/delete-spf-module-result.schema.js';
import {LINK_DELETION_MODE} from './link-deletion-mode.js';
import type {LinkDeletionMode} from './link-deletion-mode.js';

const id = (systemId: number) => ({systemId: String(systemId)});

const sortIds = (values: {systemId: string}[]) =>
  [...new Map(values.map(value => [value.systemId, value])).values()].sort(
    (left, right) => Number(left.systemId) - Number(right.systemId),
  );

const sortLinks = <
  T extends {systemId: string; subsystemLinks?: {systemId: string}[]},
>(
  values: T[],
  includeSubsystemLinks: boolean,
) => {
  const deduplicated = new Map<string, T>();
  for (const value of values) {
    const existing = deduplicated.get(value.systemId);
    deduplicated.set(
      value.systemId,
      existing
        ? {
            ...existing,
            ...value,
            ...(existing.subsystemLinks || value.subsystemLinks
              ? {
                  subsystemLinks: [
                    ...(existing.subsystemLinks ?? []),
                    ...(value.subsystemLinks ?? []),
                  ],
                }
              : {}),
          }
        : value,
    );
  }
  return [...deduplicated.values()]
    .map(value => ({
      ...value,
      ...(includeSubsystemLinks
        ? {subsystemLinks: sortIds(value.subsystemLinks ?? [])}
        : {}),
    }))
    .sort((left, right) => Number(left.systemId) - Number(right.systemId));
};

export type ModuleDeletionResult = {
  response: DeleteSpfModuleResult;
  deletedModule: {systemId: number; alias?: string};
};

export class ModuleDeletionService {
  private readonly dataLinksDeletionSvc: DataLinkDeletionService;
  private readonly controlLinksDeletionSvc: ControlLinkDeletionService;
  private readonly containersLifecycleSvc: ContainerLifecycleService;
  private readonly sgLifecycleSvc: SubgraphLifecycleService;

  constructor(private readonly uow: UnitOfWork) {
    const stackSize = new ContainerStackSizeService(uow);
    this.dataLinksDeletionSvc = new DataLinkDeletionService(uow);
    this.controlLinksDeletionSvc = new ControlLinkDeletionService(uow);
    this.containersLifecycleSvc = new ContainerLifecycleService(uow, stackSize);
    this.sgLifecycleSvc = new SubgraphLifecycleService(uow);
  }

  async deleteModule(
    moduleSystemId: number,
    fileSystemId: number,
    mode: LinkDeletionMode = LINK_DELETION_MODE.Full,
  ): Promise<ModuleDeletionResult> {
    const moduleRepository = this.uow.getModuleRepository();
    const module = await moduleRepository.findModuleById(
      moduleSystemId,
      fileSystemId,
    );
    if (!module) {
      throw new ResourceNotFoundException(
        `SPF module ${moduleSystemId} was not found.`,
        [IssueFactory.notFound(ISSUE_ENTITY_TYPE.SpfModule, moduleSystemId)],
      );
    }

    const subgraphs = await this.uow
      .getSubgraphRepository()
      .findByIds(fileSystemId, [module.subgraphSystemId]);
    const subgraph = subgraphs.at(0);
    if (!subgraph) {
      throw new ResourceNotFoundException(
        `Subgraph ${module.subgraphSystemId} was not found.`,
        [
          IssueFactory.notFound(
            ISSUE_ENTITY_TYPE.Subgraph,
            module.subgraphSystemId,
          ),
        ],
      );
    }
    if (subgraph.isImported) {
      throw new DomainRuleViolationException([
        IssueFactory.moduleInImportedSubgraph(moduleSystemId),
      ]);
    }

    const hasSubsystems = await this.uow
      .getSubsystemRepository()
      .hasSubsystems(fileSystemId);
    const dataResult = await this.dataLinksDeletionSvc.deleteConnected(
      moduleSystemId,
      fileSystemId,
      mode,
    );
    const ctrlLinkDeleteResult =
      await this.controlLinksDeletionSvc.deleteConnected(
        moduleSystemId,
        fileSystemId,
        mode,
      );
    await moduleRepository.deleteModule(moduleSystemId, fileSystemId);
    const containerResult = await this.containersLifecycleSvc.apply(
      module.containerSystemId,
      moduleSystemId,
      fileSystemId,
    );
    const updatedContainers = containerResult.deleted
      ? []
      : [
          {
            systemId: String(module.containerSystemId),
            stackSize: containerResult.stackSize,
          },
        ];
    const subgraphResult = await this.sgLifecycleSvc.apply(
      module.subgraphSystemId,
      moduleSystemId,
      fileSystemId,
    );

    const subsystems = new Map<number, Set<number>>();
    for (const cleared of ctrlLinkDeleteResult.ssIntentsClearedPorts) {
      const ports =
        subsystems.get(cleared.subsystemSystemId) ?? new Set<number>();
      ports.add(cleared.controlPortSystemId);
      subsystems.set(cleared.subsystemSystemId, ports);
    }
    const response: DeleteSpfModuleResult = {
      deleted: {
        spfModules: [id(moduleSystemId)],
        subgraphs: subgraphResult.deleted ? [id(module.subgraphSystemId)] : [],
        containers: containerResult.deleted
          ? [id(module.containerSystemId)]
          : [],
        dataLinks: sortLinks(dataResult.dataLinks, hasSubsystems),
        controlLinks: sortLinks(
          ctrlLinkDeleteResult.controlLinks,
          hasSubsystems,
        ),
        ...(hasSubsystems
          ? {
              unresolvedSubsystemDataLinks: sortIds(
                dataResult.unresolvedSubsystemDataLinks,
              ),
              unresolvedSubsystemControlLinks: sortIds(
                ctrlLinkDeleteResult.unresolvedSubsystemControlLinks,
              ),
            }
          : {}),
      },
      updated: {
        containers: updatedContainers,
        usecases: sortIds(
          subgraphResult.affectedUseCaseSystemIds.map(value => id(value)),
        ),
        ...(hasSubsystems
          ? {
              subsystems: [...subsystems.entries()]
                .map(([subsystemSystemId, ports]) => ({
                  systemId: String(subsystemSystemId),
                  intentsClearedControlPorts: sortIds(
                    [...ports].map(value => id(value)),
                  ),
                }))
                .sort(
                  (left, right) =>
                    Number(left.systemId) - Number(right.systemId),
                ),
            }
          : {}),
      },
    };
    return {response, deletedModule: module};
  }
}
