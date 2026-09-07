/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION, DomainRuleViolationException} from '@arc/core';
import type {EntityManager} from 'typeorm';
import type {
  ApplyChangeOperation,
  ReducedMainTableMutation,
} from './apply-changes.types.js';
import {ApplyIssueFactory} from './apply-issues.js';
import type {
  ApplyTarget,
  ApplyTargetRegistry,
} from './apply-target-registry.js';

/** TypeORM repository resolved from a registered permanent entity target. */
type Repository = ReturnType<EntityManager['getRepository']>;

/** Executes one operation variant against its resolved TypeORM repository. */
type MutationExecutor = (
  repository: Repository,
  target: ApplyTarget,
  mutation: ReducedMainTableMutation,
) => Promise<void>;

/**
 * Translates each reduced operation tag into its physical TypeORM write.
 * Reducers have already combined all edit rows for the permanent row before
 * one of these executors receives the mutation.
 */
const MUTATION_EXECUTORS: ReadonlyMap<ApplyChangeOperation, MutationExecutor> =
  new Map([
    [
      CHANGE_OPERATION.Create,
      async (repository, target, mutation) => {
        if (mutation.operation !== CHANGE_OPERATION.Create) {
          throw new Error('Create executor received a non-create mutation');
        }
        // Identity values are authoritative and therefore overwrite any
        // conflicting primary-key value carried by the staged payload.
        const values = target.sanitizeValues({
          ...mutation.values,
          ...mutation.target.rowIdentifier.values,
        });
        await repository.insert(values);
      },
    ],
    [
      CHANGE_OPERATION.Update,
      async (repository, target, mutation) => {
        if (mutation.operation !== CHANGE_OPERATION.Update) {
          throw new Error('Update executor received a non-update mutation');
        }
        // The resolved identity becomes the WHERE criteria; only the reduced
        // and sanitized column changes are passed to SET.
        const result = await repository.update(
          mutation.target.rowIdentifier.values,
          target.sanitizeValues(mutation.changes),
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
      async (repository, _target, mutation) => {
        if (mutation.operation !== CHANGE_OPERATION.Delete) {
          throw new Error('Delete executor received a non-delete mutation');
        }
        // Delete requires only the complete permanent-row identity derived by
        // the entity reduction rule.
        await repository.delete(mutation.target.rowIdentifier.values);
      },
    ],
  ]);

/**
 * Executes ordered apply mutations through a transaction-bound TypeORM
 * `EntityManager`. It resolves the registered permanent entity target,
 * sanitizes write values, performs exactly one insert/update/delete call, and
 * translates lookup or persistence failures into apply domain issues.
 *
 * Reduction and dependency ordering occur before this class is called. This
 * class does not read `EditActionRow` values or decide which operation wins.
 */
export class TypeOrmMutationExecutor {
  /**
   * Binds execution to the caller's transaction manager and to the catalogue
   * of permanent entities that apply is permitted to modify.
   */
  constructor(
    private readonly manager: EntityManager,
    private readonly targets: ApplyTargetRegistry,
  ) {}

  /**
   * Performs a preflight lookup for every reduced mutation so an unsupported
   * entity is detected before the caller starts executing the ordered list.
   * The method does not inspect database rows or modify mutation data.
   *
   * @example
   * A mutation targeting `ProjectSession` fails here because infrastructure
   * tables are not registered apply targets. A registered `SpfModule` mutation
   * completes validation without executing SQL.
   */
  validateMutations(mutations: readonly ReducedMainTableMutation[]): void {
    for (const mutation of mutations) {
      this.targets.get(mutation.target.entityName);
    }
  }

  /**
   * Executes one already ordered mutation and returns after its TypeORM write
   * succeeds. Any target lookup, operation dispatch, or database failure is
   * wrapped as a persistence issue containing the failed mutation context.
   *
   * @example
   * A create with `values: {name: 'Music'}` and identity `{systemId: 700}`
   * calls `insert({name: 'Music', systemId: 700})`. An update uses
   * `{systemId: 700}` as its criteria and the mutation's `changes` as its SET
   * values. A delete passes only `{systemId: 700}` to `delete()`. For a
   * composite create, both key columns come from `rowIdentifier.values`.
   */
  async execute(mutation: ReducedMainTableMutation): Promise<void> {
    try {
      const target = this.targets.get(mutation.target.entityName);
      const repository = this.manager.getRepository(target.entityName);
      const executor = MUTATION_EXECUTORS.get(mutation.operation);
      if (executor === undefined) {
        throw new Error(`Unsupported operation: ${mutation.operation}`);
      }
      await executor(repository, target, mutation);
    } catch (error) {
      throw new DomainRuleViolationException([
        ApplyIssueFactory.persistenceFailed(
          mutation,
          error instanceof Error ? error.message : String(error),
        ),
      ]);
    }
  }
}
