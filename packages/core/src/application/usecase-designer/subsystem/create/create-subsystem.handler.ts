/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {NaturalIdGenerationPort} from '../../../ports/id-generation/natural-id-generation.port.js';
import {Subsystem} from '../../../../domain/entities/usecase-data/subsystem/subsystem.js';
import {NaturalIdType} from '../../../../domain/services/natural-id-generator/natural-id-type.js';
import {
  DomainRuleViolationException,
  InvalidOperationException,
  ResourceNotFoundException,
} from '../../../../shared/exceptions/index.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import type {CreateSubsystemCommand} from './create-subsystem.command.js';

export type CreateSubsystemResult = {
  groupId: string;
  subsystemSystemId: number;
  naturalId: number;
  name: string;
  parentSystemId: number | null;
};

export class CreateSubsystemHandler implements CommandHandler<
  CreateSubsystemCommand,
  CreateSubsystemResult
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
    private readonly naturalIdGeneration: NaturalIdGenerationPort,
  ) {}

  async handle(
    command: CreateSubsystemCommand,
  ): Promise<CreateSubsystemResult> {
    if (command.name !== undefined && command.name.length > 255) {
      throw new InvalidOperationException(
        'Subsystem name must not exceed 255 characters.',
      );
    }

    await this.uow.startTransaction();
    try {
      const subsystems = await this.uow
        .getSubsystemRepository()
        .getSubsystems(command.fileSystemId);
      const normalizedName = command.name?.toLocaleLowerCase();
      const conflictingSubsystem =
        normalizedName === undefined
          ? undefined
          : subsystems.find(s => s.name.toLocaleLowerCase() === normalizedName);
      if (conflictingSubsystem !== undefined) {
        throw new DomainRuleViolationException([
          IssueFactory.duplicateSubsystemName(
            command.name!,
            conflictingSubsystem.systemId,
          ),
        ]);
      }

      if (command.parentSystemId !== null) {
        const parentExists = subsystems.some(
          s => s.systemId === command.parentSystemId,
        );
        if (!parentExists) {
          throw new ResourceNotFoundException(
            `Subsystem ${command.parentSystemId} not found.`,
            [
              IssueFactory.notFound(
                ISSUE_ENTITY_TYPE.Subsystem,
                command.parentSystemId,
              ),
            ],
          );
        }
      }

      const subsystemSystemId = await this.idGeneration.getNextId(
        command.fileSystemId,
      );
      const subsystemNaturalId = this.naturalIdGeneration.getNextId(
        command.fileSystemId,
        NaturalIdType.SUBSYSTEM,
      );
      const name =
        command.name ??
        `SS_0x${subsystemNaturalId.toString(16).padStart(8, '0').toUpperCase()}`;

      await this.uow.getSubsystemRepository().createSubsystem(
        new Subsystem({
          systemId: subsystemSystemId,
          fileSystemId: command.fileSystemId,
          parentSystemId: command.parentSystemId,
          name,
          naturalId: subsystemNaturalId,
          filteredKeySystemIds: [],
          dataPorts: [],
          controlPorts: [],
        }),
      );
      await this.uow.commit();

      return {
        groupId: this.uow.getWriteContext().groupId,
        subsystemSystemId,
        naturalId: subsystemNaturalId,
        name,
        parentSystemId: command.parentSystemId,
      };
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }
}
