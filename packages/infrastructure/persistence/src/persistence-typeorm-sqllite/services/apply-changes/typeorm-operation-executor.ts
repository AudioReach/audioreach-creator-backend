/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  CHANGE_OPERATION,
  DomainRuleViolationException,
  IssueFactory,
} from '@arc/core';
import type {PlannedMutation} from '@arc/core';
import type {EntityManager} from 'typeorm';
import type {ApplyTargetRegistry} from './apply-target-registry.js';

/**
 * Executes mutations already validated, reduced, and ordered by core. The
 * supplied EntityManager belongs to the current UnitOfWork transaction.
 */
export class TypeOrmOperationExecutor {
  constructor(
    private readonly manager: EntityManager,
    private readonly targets: ApplyTargetRegistry,
  ) {}

  async execute(mutation: PlannedMutation): Promise<void> {
    const target = this.targets.get(mutation.targetType);
    const repository = this.manager.getRepository(target.entityName);

    try {
      switch (mutation.operation) {
        case CHANGE_OPERATION.Create:
          await repository.insert(
            target.sanitizeValues(mutation.values ?? {}),
          );
          return;
        case CHANGE_OPERATION.Update: {
          const result = await repository.update(
            mutation.criteria,
            target.sanitizeValues(mutation.values ?? {}),
          );
          if (result.affected !== 1) {
            throw new Error(
              `Expected one updated row, affected ${result.affected ?? 0}`,
            );
          }
          return;
        }
        case CHANGE_OPERATION.Delete:
          await repository.delete(mutation.criteria);
          return;
        default:
          throw new Error(`Unsupported mutation operation: ${mutation.operation}`);
      }
    } catch (error) {
      throw new DomainRuleViolationException([
        IssueFactory.applyPersistenceFailed(
          mutation.targetType,
          mutation.aggregateId,
          mutation.mutationKey,
          error instanceof Error ? error.message : String(error),
        ),
      ]);
    }
  }
}

