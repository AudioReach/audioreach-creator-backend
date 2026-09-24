/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {Issue} from '../../../../shared/issues/issue.js';
import {
  DomainRuleViolationException,
  InvalidOperationException,
  ResourceNotFoundException,
} from '../../../../shared/exceptions/index.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {PORT_IO_TYPE} from '../../../../domain/entities/common/enums/port-io-type.js';
import {MODULE_PORT_STRATEGIES} from '../../../../domain/entities/common/enums/module-port-strategy.js';
import {DataPort} from '../../../../domain/entities/usecase-data/node/entities/data-port.js';
import {ControlPort} from '../../../../domain/entities/usecase-data/node/entities/control-port.js';
import {resolvePortCountChange} from '../../shared/resolve-port-count-change.js';
import {
  nextControlPortIds,
  nextDataPortIds,
} from '../../../../domain/services/port-id-calculator/port-id-calculator.js';
import type {PatchSubsystemCommand} from './patch-subsystem.command.js';
import {
  defaultSubsystemName,
  findSubsystemNameConflict,
  resolveSubsystemNameInput,
  type SubsystemPatchReadModel,
} from '../subsystem-helpers.js';

export type PatchSubsystemResult = {
  groupId: string;
  subsystem: SubsystemPatchReadModel;
  issues?: readonly Issue[];
};

export class PatchSubsystemHandler implements CommandHandler<
  PatchSubsystemCommand,
  PatchSubsystemResult
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  // Port-count changes intentionally keep input/output/control handling together
  // so partial-success rollback semantics remain visible at the transaction boundary.
  // eslint-disable-next-line sonarjs/cognitive-complexity
  async handle(command: PatchSubsystemCommand): Promise<PatchSubsystemResult> {
    if (
      command.name === undefined &&
      command.inputDataPortCount === undefined &&
      command.outputDataPortCount === undefined &&
      command.controlPortCount === undefined
    ) {
      throw new InvalidOperationException(
        'At least one field must be provided.',
      );
    }
    const requestedName = resolveSubsystemNameInput(command.name);
    if (typeof requestedName === 'string' && requestedName.length > 255) {
      throw new InvalidOperationException(
        'Subsystem name must not exceed 255 characters.',
      );
    }

    await this.uow.startTransaction();
    try {
      const subsystemRepository = this.uow.getSubsystemRepository();
      const subsystem = await subsystemRepository.getSubsystem(
        command.subsystemSystemId,
        command.fileSystemId,
      );
      if (!subsystem) {
        throw new ResourceNotFoundException(
          `Subsystem ${command.subsystemSystemId} not found.`,
          [
            IssueFactory.notFound(
              ISSUE_ENTITY_TYPE.Subsystem,
              command.subsystemSystemId,
            ),
          ],
        );
      }

      let succeeded = false;
      let updatedName = subsystem.name;
      if (requestedName !== undefined) {
        const name = requestedName ?? defaultSubsystemName(subsystem.naturalId);
        const subsystems = await subsystemRepository.getSubsystems(
          command.fileSystemId,
        );
        const conflictingSubsystem = findSubsystemNameConflict(
          subsystems,
          name,
          command.subsystemSystemId,
        );
        if (conflictingSubsystem !== undefined) {
          throw new DomainRuleViolationException([
            IssueFactory.duplicateSubsystemName(
              name,
              conflictingSubsystem.systemId,
            ),
          ]);
        }
        if (name !== subsystem.name) {
          await subsystemRepository.renameSubsystem(
            command.subsystemSystemId,
            name,
          );
          updatedName = name;
        }
        succeeded = true;
      }

      const issues: Issue[] = [];
      const updatedDataPorts = subsystem.dataPorts.map(port => ({
        systemId: port.systemId,
        portId: port.naturalId,
        name: port.name ?? null,
        portIoType: port.portIoType,
        isStatic: port.isStatic,
        totalLinksAtPort: 0,
      }));
      const updatedControlPorts = subsystem.controlPorts.map(port => ({
        systemId: port.systemId,
        portId: port.naturalId,
        name: port.name ?? null,
        isStatic: port.isStatic,
        allocatedIntents: port.intentIds.map((systemId, index) => ({
          systemId,
          intentId: port.intentTypeIds[index] ?? 0,
        })),
        totalLinksAtPort: 0,
      }));
      const allocatedDataPortIds = new Set(
        subsystem.dataPorts.map(port => port.naturalId),
      );
      const dataInputs = [
        [PORT_IO_TYPE.Input, command.inputDataPortCount],
        [PORT_IO_TYPE.Output, command.outputDataPortCount],
      ] as const;

      for (const [direction, requested] of dataInputs) {
        if (requested === undefined) continue;
        const current = subsystem.dataPorts.filter(
          port => port.portIoType === direction,
        );
        const links = await this.uow
          .getDataLinkRepository()
          .getLinksByPortSystemIds(
            current.map(port => port.systemId),
            command.fileSystemId,
          );
        const outcome = resolvePortCountChange(
          current,
          requested,
          Number.MAX_SAFE_INTEGER,
          links,
          ISSUE_ENTITY_TYPE.DataPort,
          command.subsystemSystemId,
        );
        if (outcome.kind === 'FAIL') {
          issues.push(...outcome.issues);
          continue;
        }
        succeeded = true;
        const isInput = direction === PORT_IO_TYPE.Input;
        for (const portId of nextDataPortIds(
          allocatedDataPortIds,
          isInput,
          MODULE_PORT_STRATEGIES.SEQUENTIAL,
          outcome.data.toAdd,
        )) {
          const systemId = await this.idGeneration.getNextId(
            command.fileSystemId,
          );
          await subsystemRepository.addDataPort(
            new DataPort({
              systemId,
              naturalId: portId,
              portIoType: direction,
              isStatic: false,
              name: '',
            }),
            command.subsystemSystemId,
          );
          allocatedDataPortIds.add(portId);
          updatedDataPorts.push({
            systemId,
            portId,
            name: '',
            portIoType: direction,
            isStatic: false,
            totalLinksAtPort: 0,
          });
        }
        for (const portSystemId of outcome.data.toRemove) {
          await subsystemRepository.removeDataPort(
            portSystemId,
            command.subsystemSystemId,
          );
          const index = updatedDataPorts.findIndex(
            port => port.systemId === portSystemId,
          );
          if (index !== -1) updatedDataPorts.splice(index, 1);
        }
      }

      if (command.controlPortCount !== undefined) {
        const current = subsystem.controlPorts;
        const links = await this.uow
          .getControlLinkRepository()
          .getLinksByPortSystemIds(
            current.map(port => port.systemId),
            command.fileSystemId,
          );
        const outcome = resolvePortCountChange(
          current,
          command.controlPortCount,
          Number.MAX_SAFE_INTEGER,
          links,
          ISSUE_ENTITY_TYPE.ControlPort,
          command.subsystemSystemId,
        );
        if (outcome.kind === 'FAIL') {
          issues.push(...outcome.issues);
        } else {
          succeeded = true;
          const allocated = new Set(current.map(port => port.naturalId));
          for (const portId of nextControlPortIds(
            allocated,
            outcome.data.toAdd,
          )) {
            const systemId = await this.idGeneration.getNextId(
              command.fileSystemId,
            );
            await subsystemRepository.addControlPort(
              new ControlPort({
                systemId,
                naturalId: portId,
                isStatic: false,
                nodeSystemId: command.subsystemSystemId,
                name: '',
                intentSystemIds: [],
              }),
              command.subsystemSystemId,
            );
            updatedControlPorts.push({
              systemId,
              portId,
              name: '',
              isStatic: false,
              allocatedIntents: [],
              totalLinksAtPort: 0,
            });
          }
          for (const portSystemId of outcome.data.toRemove) {
            await subsystemRepository.removeControlPort(
              portSystemId,
              command.subsystemSystemId,
            );
            const index = updatedControlPorts.findIndex(
              port => port.systemId === portSystemId,
            );
            if (index !== -1) updatedControlPorts.splice(index, 1);
          }
        }
      }

      if (!succeeded) {
        throw new DomainRuleViolationException(issues);
      }
      await this.uow.commit();
      const filteredKeys = await subsystemRepository.getKeysAssignedToSubsystem(
        subsystem.filteredKeySystemIds,
        command.fileSystemId,
      );
      return {
        groupId: this.uow.getWriteContext().groupId,
        subsystem: {
          systemId: subsystem.systemId,
          naturalId: subsystem.naturalId,
          name: updatedName,
          parentSystemId: subsystem.parentSystemId ?? null,
          filteredKeys,
          dataPorts: updatedDataPorts,
          controlPorts: updatedControlPorts,
        },
        ...(issues.length > 0 ? {issues} : {}),
      };
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }
}
