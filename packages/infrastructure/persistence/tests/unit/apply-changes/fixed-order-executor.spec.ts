/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {CHANGE_OPERATION} from '@arc/core';
import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import type {ReducedEditAction} from '../../../src/persistence-typeorm-sqllite/services/apply-changes/apply-changes.types.js';
import {executeReducedEditActionsInFixedOrder} from '../../../src/persistence-typeorm-sqllite/services/apply-changes/fixed-order-executor.js';

function action(
  tableName: ReducedEditAction['tableName'],
  operation: ReducedEditAction['operation'],
  systemId: number,
): ReducedEditAction {
  return {
    tableName,
    operation,
    targetSystemId: systemId,
    ...(operation === CHANGE_OPERATION.Update ? {values: {alias: 'x'}} : {}),
    sourceEditActionIds: [systemId],
  };
}

describe('executeReducedEditActionsInFixedOrder', () => {
  it('executes relationships before runtime parents and definitions last', async () => {
    const calls: string[] = [];
    const repository = (tableName: string) => ({
      insert: jest.fn(async () => calls.push(`${tableName}:CREATE`)),
      update: jest.fn(async () => calls.push(`${tableName}:UPDATE`)),
      delete: jest.fn(async () => calls.push(`${tableName}:DELETE`)),
    });
    const manager = {
      getRepository: (tableName: string) => repository(tableName),
    } as unknown as EntityManager;

    await executeReducedEditActionsInFixedOrder(manager, [
      action(ENTITY_NAMES.KeyDefinition, CHANGE_OPERATION.Delete, 4),
      action(ENTITY_NAMES.UseCase, CHANGE_OPERATION.Delete, 3),
      action(ENTITY_NAMES.UseCaseSubgraph, CHANGE_OPERATION.Delete, 2),
      action(ENTITY_NAMES.SpfModule, CHANGE_OPERATION.Create, 1),
    ]);

    expect(calls).toEqual([
      'UseCaseSubgraph:DELETE',
      'UseCase:DELETE',
      'SpfModule:CREATE',
      'KeyDefinition:DELETE',
    ]);
  });

  it('preserves reduced action order within one table-operation step', async () => {
    const calls: number[] = [];
    const manager = {
      getRepository: () => ({
        insert: async (value: {systemId: number}) => calls.push(value.systemId),
        update: jest.fn(),
        delete: jest.fn(),
      }),
    } as unknown as EntityManager;

    await executeReducedEditActionsInFixedOrder(manager, [
      action(ENTITY_NAMES.SpfModule, CHANGE_OPERATION.Create, 8),
      action(ENTITY_NAMES.SpfModule, CHANGE_OPERATION.Create, 2),
    ]);

    expect(calls).toEqual([8, 2]);
  });

  it('supports updates for synthetic-ID relationship tables', async () => {
    const updates: string[] = [];
    const manager = {
      getRepository: (tableName: string) => ({
        insert: jest.fn(),
        update: jest.fn(async () => updates.push(tableName)),
        delete: jest.fn(),
      }),
    } as unknown as EntityManager;
    const relationshipTables = [
      ENTITY_NAMES.CkvValues,
      ENTITY_NAMES.TkvValues,
      ENTITY_NAMES.DkvValues,
      ENTITY_NAMES.SgkvValues,
      ENTITY_NAMES.VcpmCkvValues,
      ENTITY_NAMES.UsecaseGkvValues,
      ENTITY_NAMES.SubsystemFilteredKey,
      ENTITY_NAMES.UseCaseCategoryJoin,
      ENTITY_NAMES.ModuleDefinitionContainerTypeLink,
      ENTITY_NAMES.ModuleDefinitionProcessorLink,
    ] as const;

    await executeReducedEditActionsInFixedOrder(
      manager,
      relationshipTables.map((tableName, index) =>
        action(tableName, CHANGE_OPERATION.Update, index + 1),
      ),
    );

    expect(new Set(updates)).toEqual(new Set(relationshipTables));
    expect(updates).toHaveLength(relationshipTables.length);
  });

  it('rejects unsupported table-operation paths before writing', async () => {
    const insert = jest.fn();
    const manager = {
      getRepository: () => ({insert, update: jest.fn(), delete: jest.fn()}),
    } as unknown as EntityManager;

    await expect(
      executeReducedEditActionsInFixedOrder(manager, [
        action(ENTITY_NAMES.EditAction, CHANGE_OPERATION.Update, 1),
      ]),
    ).rejects.toMatchObject({errorCode: 'COMMIT_VALIDATION_FAILED'});
    expect(insert).not.toHaveBeenCalled();
  });
});
