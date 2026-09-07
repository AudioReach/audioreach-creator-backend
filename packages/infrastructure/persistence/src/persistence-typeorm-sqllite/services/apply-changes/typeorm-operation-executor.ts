/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION, DomainRuleViolationException} from '@arc/core';
import type {EntityManager} from 'typeorm';
import type {
  ApplyChangeOperation,
  MainTableEntityWriteOperation,
} from './apply-changes.types.js';
import {ApplyIssueFactory} from './apply-issues.js';
import type {
  ApplyTarget,
  ApplyTargetRegistry,
} from './apply-target-registry.js';

type Repository = ReturnType<EntityManager['getRepository']>;
type OperationExecutor = (
  repository: Repository,
  target: ApplyTarget,
  operation: MainTableEntityWriteOperation,
) => Promise<void>;

const OPERATION_EXECUTORS: ReadonlyMap<
  ApplyChangeOperation,
  OperationExecutor
> = new Map([
  [
    CHANGE_OPERATION.Create,
    async (repository, target, operation) => {
      if (operation.operation !== CHANGE_OPERATION.Create) {
        throw new Error('Create executor received a non-create operation');
      }
      const values = target.sanitizeValues({
        ...operation.values,
        ...operation.target.rowIdentifier.values,
      });
      await repository.insert(values);
    },
  ],
  [
    CHANGE_OPERATION.Update,
    async (repository, target, operation) => {
      if (operation.operation !== CHANGE_OPERATION.Update) {
        throw new Error('Update executor received a non-update operation');
      }
      const result = await repository.update(
        operation.target.rowIdentifier.values,
        target.sanitizeValues(operation.changes),
      );
      if (result.affected !== 1) {
        throw new Error(
          `Expected one updated row, affected ${result.affected ?? 0}`,
        );
      }
    },
  ],
  [
    CHANGE_OPERATION.Delete,
    async (repository, _target, operation) => {
      if (operation.operation !== CHANGE_OPERATION.Delete) {
        throw new Error('Delete executor received a non-delete operation');
      }
      await repository.delete(operation.target.rowIdentifier.values);
    },
  ],
]);

/**
 * Performs physical main-table writes for operations that persistence has
 * already reduced and ordered. It never interprets edit actions or decides
 * execution order.
 */
export class TypeOrmOperationExecutor {
  constructor(
    private readonly manager: EntityManager,
    private readonly targets: ApplyTargetRegistry,
  ) {}

  /** Validates all TypeORM target registrations before the first write. */
  validateOperations(
    operations: readonly MainTableEntityWriteOperation[],
  ): void {
    for (const operation of operations) {
      this.targets.get(operation.target.entityName);
    }
  }

  /** Executes one prepared create, update, or delete against its main table. */
  async execute(operation: MainTableEntityWriteOperation): Promise<void> {
    try {
      const target = this.targets.get(operation.target.entityName);
      const repository = this.manager.getRepository(target.entityName);
      const executor = OPERATION_EXECUTORS.get(operation.operation);
      if (executor === undefined) {
        throw new Error(`Unsupported operation: ${operation.operation}`);
      }
      await executor(repository, target, operation);
    } catch (error) {
      throw new DomainRuleViolationException([
        ApplyIssueFactory.persistenceFailed(
          operation,
          error instanceof Error ? error.message : String(error),
        ),
      ]);
    }
  }
}
