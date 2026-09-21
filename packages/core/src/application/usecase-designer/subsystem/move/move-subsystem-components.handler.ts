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
import type {Issue} from '../../../../shared/issues/issue.js';
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
  issues?: readonly Issue[];
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
        .getSubsystems(command.fileSystemId);
      const topology = await this.uow
        .getSubsystemRepository()
        .getAllNodesWithParents(command.fileSystemId);
      const parentBefore = new Map(
        topology.map(node => [node.systemId, node.parentSystemId]),
      );
      const issues: Issue[] = [];
      const subsystemIds = new Set(subsystems.map(item => item.systemId));
      const subsystemSystemIds: number[] = [];
      for (const systemId of command.subsystemSystemIds) {
        if (!subsystemIds.has(systemId)) {
          throw new ResourceNotFoundException(
            `Subsystem ${systemId} not found.`,
            [IssueFactory.notFound(ISSUE_ENTITY_TYPE.Subsystem, systemId)],
          );
        }
        const subsystem = subsystems.find(item => item.systemId === systemId)!;
        if (
          command.targetSubsystemSystemId === null &&
          (subsystem.parentSystemId ?? null) === null
        ) {
          issues.push(
            IssueFactory.duplicateRootMove(
              ISSUE_ENTITY_TYPE.Subsystem,
              systemId,
            ),
          );
          continue;
        }
        subsystemSystemIds.push(systemId);
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
        for (const componentSystemId of subsystemSystemIds) {
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

        for (const componentSystemId of subsystemSystemIds) {
          const component = subsystems.find(
            item => item.systemId === componentSystemId,
          );
          if (component?.parentSystemId === command.targetSubsystemSystemId) {
            throw new DomainRuleViolationException([
              IssueFactory.duplicateChildComponent(
                componentSystemId,
                command.targetSubsystemSystemId,
              ),
            ]);
          }
        }
      }

      const subgraphSystemIds: number[] = [];
      const modulesBySubgraph = new Map<number, Array<{systemId: number}>>();
      for (const subgraphSystemId of command.subgraphSystemIds) {
        const exists = await this.uow
          .getSubgraphRepository()
          .subgraphExists(subgraphSystemId, command.fileSystemId);
        if (!exists) {
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
        modulesBySubgraph.set(subgraphSystemId, modules);
        subgraphSystemIds.push(subgraphSystemId);
      }

      if (command.targetSubsystemSystemId !== null) {
        const movedModuleSystemIds = new Set(
          [...modulesBySubgraph.values()].flatMap(modules =>
            modules.map(module => module.systemId),
          ),
        );
        const targetSubsystem = subsystems.find(
          subsystem => subsystem.systemId === command.targetSubsystemSystemId,
        );
        const duplicateModuleSystemId = targetSubsystem?.moduleSystemIds.find(
          moduleSystemId => movedModuleSystemIds.has(moduleSystemId),
        );
        if (duplicateModuleSystemId !== undefined) {
          throw new DomainRuleViolationException([
            IssueFactory.duplicateChildComponent(
              duplicateModuleSystemId,
              command.targetSubsystemSystemId,
            ),
          ]);
        }
      }

      if (subsystemSystemIds.length === 0 && subgraphSystemIds.length === 0) {
        throw new DomainRuleViolationException(issues);
      }

      const updatedModules: MoveSubsystemComponentsResult['updatedModules'] =
        [];
      for (const subgraphSystemId of subgraphSystemIds) {
        const modules = modulesBySubgraph.get(subgraphSystemId) ?? [];
        for (const module of modules) {
          if (
            command.targetSubsystemSystemId === null &&
            (parentBefore.get(module.systemId) ?? null) === null
          ) {
            issues.push(
              IssueFactory.duplicateRootMove(
                ISSUE_ENTITY_TYPE.SpfModule,
                module.systemId,
              ),
            );
            continue;
          }
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
      for (const subsystemSystemId of subsystemSystemIds) {
        await this.uow
          .getSubsystemRepository()
          .updateParentId(subsystemSystemId, command.targetSubsystemSystemId);
        updatedSubsystems.push({
          systemId: subsystemSystemId,
          parentSystemId: command.targetSubsystemSystemId,
        });
      }

      if (
        updatedModules.length === 0 &&
        updatedSubsystems.length === 0 &&
        issues.length > 0
      ) {
        throw new DomainRuleViolationException(issues);
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
        ...(issues.length > 0 ? {issues} : {}),
      };
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }
}
