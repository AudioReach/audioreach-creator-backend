/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {
  DomainRuleViolationException,
  InvalidOperationException,
  ResourceNotFoundException,
} from '../../../../shared/exceptions/index.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import type {MoveSubsystemComponentsCommand} from './move-subsystem-components.command.js';
import {isDescendant} from '../subsystem-helpers.js';
import {
  rebuildMoveSubsystemImpact,
  type MoveSubsystemImpact,
} from './move-subsystem-impact.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';

export type MoveSubsystemComponentsResult = {
  groupId: string;
  updatedModules: Array<{systemId: number; parentSystemId: number | null}>;
  updatedSubsystems: Array<{systemId: number; parentSystemId: number | null}>;
} & MoveSubsystemImpact;

export class MoveSubsystemComponentsHandler implements CommandHandler<
  MoveSubsystemComponentsCommand,
  MoveSubsystemComponentsResult
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  // The move validates two component types and hierarchy rules in one transaction.
  // eslint-disable-next-line sonarjs/cognitive-complexity
  async handle(
    command: MoveSubsystemComponentsCommand,
  ): Promise<MoveSubsystemComponentsResult> {
    if (
      command.subgraphSystemIds.length === 0 &&
      command.subsystemSystemIds.length === 0
    ) {
      throw new InvalidOperationException(
        'At least one component system ID must be provided.',
      );
    }

    await this.uow.startTransaction();
    try {
      const subsystems = await this.uow
        .getSubsystemRepository()
        .findSubsystems(command.fileSystemId);
      const topology = await this.uow
        .getSubsystemRepository()
        .findNodeTopology(command.fileSystemId);
      const subsystemIds = new Set(subsystems.map(item => item.systemId));
      for (const systemId of command.subsystemSystemIds) {
        if (!subsystemIds.has(systemId)) {
          throw new ResourceNotFoundException(
            `Subsystem ${systemId} not found.`,
            [IssueFactory.notFound(ISSUE_ENTITY_TYPE.Subsystem, systemId)],
          );
        }
      }
      if (
        command.targetSubsystemSystemId !== null &&
        !subsystemIds.has(command.targetSubsystemSystemId)
      ) {
        throw new ResourceNotFoundException(
          `Subsystem ${command.targetSubsystemSystemId} not found.`,
          [
            IssueFactory.notFound(
              ISSUE_ENTITY_TYPE.Subsystem,
              command.targetSubsystemSystemId,
            ),
          ],
        );
      }

      if (command.targetSubsystemSystemId !== null) {
        for (const componentSystemId of command.subsystemSystemIds) {
          if (
            componentSystemId === command.targetSubsystemSystemId ||
            isDescendant(
              command.targetSubsystemSystemId,
              componentSystemId,
              subsystems,
            )
          ) {
            throw new DomainRuleViolationException([
              IssueFactory.circularSubsystemHierarchy(
                componentSystemId,
                command.targetSubsystemSystemId,
              ),
            ]);
          }
        }

        for (const componentSystemId of command.subsystemSystemIds) {
          const component = subsystems.find(
            item => item.systemId === componentSystemId,
          );
          if (component?.parentId === command.targetSubsystemSystemId) {
            throw new DomainRuleViolationException([
              IssueFactory.duplicateChildComponent(
                componentSystemId,
                command.targetSubsystemSystemId,
              ),
            ]);
          }
        }

        for (const component of subsystems) {
          if (
            component.subgraphSystemIds?.some(subgraphSystemId =>
              command.subgraphSystemIds.includes(subgraphSystemId),
            ) &&
            component.systemId === command.targetSubsystemSystemId
          ) {
            throw new DomainRuleViolationException([
              IssueFactory.duplicateChildComponent(
                component.subgraphSystemIds.find(subgraphSystemId =>
                  command.subgraphSystemIds.includes(subgraphSystemId),
                )!,
                command.targetSubsystemSystemId,
              ),
            ]);
          }
        }
      }

      const updatedModules: MoveSubsystemComponentsResult['updatedModules'] =
        [];
      for (const subgraphSystemId of command.subgraphSystemIds) {
        if (
          !(await this.uow
            .getSubgraphRepository()
            .subgraphExists(subgraphSystemId, command.fileSystemId))
        ) {
          throw new ResourceNotFoundException(
            `Subgraph ${subgraphSystemId} not found.`,
            [
              IssueFactory.notFound(
                ISSUE_ENTITY_TYPE.Subgraph,
                subgraphSystemId,
              ),
            ],
          );
        }
        const modules = await this.uow
          .getModuleRepository()
          .findModulesBySubgraphIds([subgraphSystemId], command.fileSystemId);
        for (const module of modules) {
          await this.uow
            .getModuleRepository()
            .updateParentId(module.systemId, command.targetSubsystemSystemId);
          updatedModules.push({
            systemId: module.systemId,
            parentSystemId: command.targetSubsystemSystemId,
          });
        }
      }

      const updatedSubsystems: MoveSubsystemComponentsResult['updatedSubsystems'] =
        [];
      for (const subsystemSystemId of command.subsystemSystemIds) {
        await this.uow
          .getSubsystemRepository()
          .updateParentId(subsystemSystemId, command.targetSubsystemSystemId);
        updatedSubsystems.push({
          systemId: subsystemSystemId,
          parentSystemId: command.targetSubsystemSystemId,
        });
      }

      const impact = await rebuildMoveSubsystemImpact(
        command.fileSystemId,
        topology,
        updatedModules,
        updatedSubsystems,
        {
          subsystemRepository: this.uow.getSubsystemRepository(),
          dataLinkRepository: this.uow.getDataLinkRepository(),
          controlLinkRepository: this.uow.getControlLinkRepository(),
          idGeneration: this.idGeneration,
        },
      );

      await this.uow.commit();
      return {
        groupId: this.uow.getWriteContext().groupId,
        updatedModules,
        updatedSubsystems,
        ...impact,
      };
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }
}
