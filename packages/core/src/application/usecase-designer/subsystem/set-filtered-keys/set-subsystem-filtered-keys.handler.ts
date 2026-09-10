/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {SubsystemKeyDefinition} from '../../../ports/persistence/repositories/subsystem/subsystem.repository.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/index.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import type {SetSubsystemFilteredKeysCommand} from './set-subsystem-filtered-keys.command.js';

export type SetSubsystemFilteredKeysResult = {
  groupId: string;
  subsystemSystemId: number;
  filteredKeys: SubsystemKeyDefinition[];
};

export class SetSubsystemFilteredKeysHandler implements CommandHandler<
  SetSubsystemFilteredKeysCommand,
  SetSubsystemFilteredKeysResult
> {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(
    command: SetSubsystemFilteredKeysCommand,
  ): Promise<SetSubsystemFilteredKeysResult> {
    await this.uow.startTransaction();
    try {
      const subsystemExists = await this.uow
        .getSubsystemRepository()
        .subsystemExists(command.subsystemSystemId, command.fileSystemId);
      if (!subsystemExists) {
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

      const filteredKeys = await this.uow
        .getSubsystemRepository()
        .findKeyDefinitionsByIds(command.keySystemIds, command.fileSystemId);
      if (filteredKeys.length !== command.keySystemIds.length) {
        const found = new Set(filteredKeys.map(key => key.systemId));
        const missing = command.keySystemIds.find(id => !found.has(id));
        if (missing !== undefined) {
          throw new ResourceNotFoundException(
            `KeyDefinition ${missing} not found.`,
            [IssueFactory.notFound(ISSUE_ENTITY_TYPE.KeyDefinition, missing)],
          );
        }
      }

      await this.uow
        .getSubsystemRepository()
        .setFilteredKeys(command.subsystemSystemId, command.keySystemIds);
      await this.uow.commit();
      return {
        groupId: this.uow.getWriteContext().groupId,
        subsystemSystemId: command.subsystemSystemId,
        filteredKeys,
      };
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }
}
