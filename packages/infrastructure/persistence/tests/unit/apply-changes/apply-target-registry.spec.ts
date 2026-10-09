/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION, CHANGE_STATUS, RESULT_KIND, SOURCE} from '@arc/core';
import type {EditActionRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
import type {
  ApplyChangeOperation,
  ReducedMainTableMutation,
} from '../../../src/persistence-typeorm-sqllite/services/apply-changes/apply-changes.types.js';
import {orderMainTableMutations} from '../../../src/persistence-typeorm-sqllite/services/apply-changes/apply-execution-order.js';
import {ApplyOperationReducer} from '../../../src/persistence-typeorm-sqllite/services/apply-changes/apply-operation-reducer.js';
import {
  createDefaultApplyExecutionSchedule,
  createDefaultApplyReductionRegistry,
  createDefaultApplyTargetRegistry,
} from '../../../src/persistence-typeorm-sqllite/services/apply-changes/apply-target-registry.js';

let nextChangeId = 1;

function action(
  targetTable: string,
  targetSystemId: number,
  operation: ApplyChangeOperation,
  aggregateId = 1,
  newValue: unknown = {},
  fieldPath: string | null = operation === CHANGE_OPERATION.Create ? '$' : null,
): EditActionRow {
  return {
    changeId: nextChangeId++,
    sessionId: 1,
    aggregateId,
    targetSystemId,
    targetTable: targetTable as EditActionRow['targetTable'],
    operation,
    fieldPath,
    newValue,
    source: SOURCE.Manual,
    changeStatus: CHANGE_STATUS.Staged,
    groupId: null,
    linkedEntityGroupId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    validUntil: null,
  };
}

function reduce(
  rows: readonly EditActionRow[],
): readonly ReducedMainTableMutation[] {
  const result = new ApplyOperationReducer(
    createDefaultApplyReductionRegistry(),
  ).reduce(rows);
  expect(result.kind).toBe(RESULT_KIND.Ok);
  if (result.kind !== RESULT_KIND.Ok) {
    throw new Error('Could not reduce edit-action rows');
  }
  return result.data;
}

function orderedEntityNames(
  mutations: readonly ReducedMainTableMutation[],
): string[] {
  return orderMainTableMutations(
    mutations,
    createDefaultApplyExecutionSchedule(),
  ).map(mutation => mutation.target.entityName);
}

describe('default apply persistence catalogue', () => {
  beforeEach(() => {
    nextChangeId = 1;
  });

  it('registers supported targets and rejects infrastructure tables', () => {
    const targets = createDefaultApplyTargetRegistry();

    expect(targets.get('SpfModule').entityName).toBe('SpfModule');
    expect(targets.get('UsecaseGkvValues').entityName).toBe('UsecaseGkvValues');
    expect(() => targets.get('ProjectSession')).toThrow(
      'Unsupported apply target',
    );
  });

  it('uses a dedicated key-only reducer for composite value targets', () => {
    const result = new ApplyOperationReducer(
      createDefaultApplyReductionRegistry(),
    ).reduce([
      action(
        'CkvValues',
        20,
        CHANGE_OPERATION.Update,
        10,
        {ckvSystemId: 20, valueDefSystemId: 30},
        '$key:valueDefSystemId=30',
      ),
    ]);

    expect(result.kind).toBe(RESULT_KIND.Fail);
  });

  it('strips overlay-only referencedComponents from UseCase values', () => {
    const targets = createDefaultApplyTargetRegistry();

    expect(
      targets.get('UseCase').sanitizeValues({
        systemId: 10,
        alias: 'voice',
        referencedComponents: {modules: [1]},
      }),
    ).toEqual({systemId: 10, alias: 'voice'});
  });

  it('uses the fixed module delete sequence', () => {
    const operations = reduce([
      action('Node', 10, CHANGE_OPERATION.Delete, 10),
      action('SpfModule', 10, CHANGE_OPERATION.Delete, 10),
      action('DataPort', 11, CHANGE_OPERATION.Delete, 10),
    ]);

    expect(orderedEntityNames(operations)).toEqual([
      'DataPort',
      'SpfModule',
      'Node',
    ]);
  });

  it('runs use-case family deletes before other miscellaneous deletes', () => {
    const operations = reduce([
      action('UseCase', 100, CHANGE_OPERATION.Delete, 100),
      action('UseCaseSubgraph', 101, CHANGE_OPERATION.Delete, 100),
      action('UseCaseSubgraphPair', 102, CHANGE_OPERATION.Delete, 100),
      action(
        'UsecaseGkvValues',
        100,
        CHANGE_OPERATION.Delete,
        100,
        {usecaseSystemId: 100, valueDefSystemId: 103},
        '$key:valueDefSystemId=103',
      ),
      action('UseCaseCategory', 200, CHANGE_OPERATION.Delete, 200),
      action('ModuleManagerData', 300, CHANGE_OPERATION.Delete, 300),
      action('DriverModule', 400, CHANGE_OPERATION.Delete, 400),
      action('DataLink', 500, CHANGE_OPERATION.Delete, 500),
    ]);

    expect(orderedEntityNames(operations)).toEqual([
      'UsecaseGkvValues',
      'UseCaseSubgraph',
      'UseCaseSubgraphPair',
      'UseCase',
      'UseCaseCategory',
      'ModuleManagerData',
      'DriverModule',
      'DataLink',
    ]);
  });

  it('orders SPF definition parents before children on create and reverses deletes', () => {
    const creates = reduce([
      action('SpfModuleDefinition', 10, CHANGE_OPERATION.Create, 10),
      action('DataPortGroup', 11, CHANGE_OPERATION.Create, 10),
      action('DataPortDefinition', 12, CHANGE_OPERATION.Create, 10),
    ]);
    const deletes = reduce([
      action('SpfModuleDefinition', 10, CHANGE_OPERATION.Delete, 10),
      action('DataPortGroup', 11, CHANGE_OPERATION.Delete, 10),
      action('DataPortDefinition', 12, CHANGE_OPERATION.Delete, 10),
    ]);

    expect(orderedEntityNames(creates)).toEqual([
      'SpfModuleDefinition',
      'DataPortGroup',
      'DataPortDefinition',
    ]);
    expect(orderedEntityNames(deletes)).toEqual([
      'DataPortDefinition',
      'DataPortGroup',
      'SpfModuleDefinition',
    ]);
  });

  it('orders updates before creates in one entity execution step', () => {
    const operations = reduce([
      action('UseCaseCategory', 30, CHANGE_OPERATION.Update, 30, {
        name: 'updated',
      }),
      action('UseCaseCategory', 31, CHANGE_OPERATION.Create, 31, {
        name: 'created',
      }),
    ]);

    expect(
      orderMainTableMutations(
        operations,
        createDefaultApplyExecutionSchedule(),
      ).map(mutation => mutation.operation),
    ).toEqual([CHANGE_OPERATION.Update, CHANGE_OPERATION.Create]);
  });

  it('orders relationship deletes before link rows', () => {
    const operations = reduce([
      action('DataLink', 40, CHANGE_OPERATION.Delete, 40),
      action('SubsystemDataLink', 41, CHANGE_OPERATION.Delete, 40),
      action('ControlLink', 42, CHANGE_OPERATION.Delete, 42),
      action('SubsystemControlLink', 43, CHANGE_OPERATION.Delete, 42),
    ]);

    expect(orderedEntityNames(operations)).toEqual([
      'SubsystemDataLink',
      'DataLink',
      'SubsystemControlLink',
      'ControlLink',
    ]);
  });

  it('orders composite values after parent creates and before parent deletes', () => {
    const value = {
      ckvSystemId: 50,
      valueDefSystemId: 60,
    };
    const creates = reduce([
      action('Ckv', 50, CHANGE_OPERATION.Create, 50),
      action(
        'CkvValues',
        50,
        CHANGE_OPERATION.Create,
        50,
        value,
        '$key:valueDefSystemId=60',
      ),
    ]);
    const deletes = reduce([
      action('Ckv', 50, CHANGE_OPERATION.Delete, 50),
      action(
        'CkvValues',
        50,
        CHANGE_OPERATION.Delete,
        50,
        value,
        '$key:valueDefSystemId=60',
      ),
    ]);

    expect(orderedEntityNames(creates)).toEqual(['Ckv', 'CkvValues']);
    expect(orderedEntityNames(deletes)).toEqual(['CkvValues', 'Ckv']);
  });
});
