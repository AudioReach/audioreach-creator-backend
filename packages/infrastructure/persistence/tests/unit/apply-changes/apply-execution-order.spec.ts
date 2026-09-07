/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION} from '@arc/core';
import {
  orderPersistenceOperations,
  type ApplyExecutionSchedule,
} from '../../../src/persistence-typeorm-sqllite/services/apply-changes/apply-execution-order.js';
import type {MainTableEntityWriteOperation} from '../../../src/persistence-typeorm-sqllite/services/apply-changes/apply-changes.types.js';

function operation(
  entityName: string,
  systemId: number,
  changeOperation: MainTableEntityWriteOperation['operation'] = CHANGE_OPERATION.Create,
  aggregateId = 1,
): MainTableEntityWriteOperation {
  const target = {
    entityName,
    rowIdentifier: {
      kind: 'SYSTEM_ID' as const,
      values: {systemId},
    },
  };
  if (changeOperation === CHANGE_OPERATION.Update) {
    return {aggregateId, target, operation: changeOperation, changes: {}};
  }
  if (changeOperation === CHANGE_OPERATION.Delete) {
    return {aggregateId, target, operation: changeOperation};
  }
  return {aggregateId, target, operation: changeOperation, values: {}};
}

function schedule(
  entries: readonly [
    string,
    MainTableEntityWriteOperation['operation'],
    number,
    number,
    number,
  ][],
): ApplyExecutionSchedule {
  return new Map(
    entries.map(([entityName, changeOperation, phase, step, sequence]) => [
      `${entityName}\u0000${changeOperation}`,
      {phase, step, sequence},
    ]),
  );
}

describe('orderPersistenceOperations', () => {
  it('follows fixed phase and step order instead of input or entity-name order', () => {
    const miscDelete = operation('UseCaseCategory', 5, CHANGE_OPERATION.Delete);
    const graphDelete = operation('DataLink', 101, CHANGE_OPERATION.Delete);
    const definitionUpdate = operation('GraphKey', 10, CHANGE_OPERATION.Update);
    const graphUpdate = operation('SpfModule', 20, CHANGE_OPERATION.Update);
    const usecaseCreate = operation('UseCase', 30);
    const linkCreate = operation('DataLink', 202);
    const miscUpdate = operation(
      'ModuleManagerData',
      40,
      CHANGE_OPERATION.Update,
    );
    const definitionDelete = operation('GraphKey', 11, CHANGE_OPERATION.Delete);
    const input = [
      definitionDelete,
      miscUpdate,
      linkCreate,
      usecaseCreate,
      graphUpdate,
      definitionUpdate,
      graphDelete,
      miscDelete,
    ];
    const executionSchedule = schedule([
      ['UseCaseCategory', CHANGE_OPERATION.Delete, 1, 1, 1],
      ['DataLink', CHANGE_OPERATION.Delete, 2, 1, 1],
      ['GraphKey', CHANGE_OPERATION.Update, 3, 1, 1],
      ['SpfModule', CHANGE_OPERATION.Update, 4, 1, 1],
      ['UseCase', CHANGE_OPERATION.Create, 4, 8, 2],
      ['DataLink', CHANGE_OPERATION.Create, 4, 9, 1],
      ['ModuleManagerData', CHANGE_OPERATION.Update, 5, 2, 1],
      ['GraphKey', CHANGE_OPERATION.Delete, 6, 1, 1],
    ]);

    expect(
      orderPersistenceOperations(input, executionSchedule).map(
        item =>
          `${item.target.entityName}:${item.target.rowIdentifier.values.systemId}`,
      ),
    ).toEqual([
      'UseCaseCategory:5',
      'DataLink:101',
      'GraphKey:10',
      'SpfModule:20',
      'UseCase:30',
      'DataLink:202',
      'ModuleManagerData:40',
      'GraphKey:11',
    ]);
  });

  it('uses the hardcoded sequence before deterministic row ordering', () => {
    const secondEntity = operation('Second', 1);
    const firstEntitySecondRow = operation('First', 2);
    const firstEntityFirstRow = operation('First', 1);
    const executionSchedule = schedule([
      ['First', CHANGE_OPERATION.Create, 3, 1, 2],
      ['Second', CHANGE_OPERATION.Create, 3, 1, 1],
    ]);

    expect(
      orderPersistenceOperations(
        [firstEntitySecondRow, firstEntityFirstRow, secondEntity],
        executionSchedule,
      ),
    ).toEqual([secondEntity, firstEntityFirstRow, firstEntitySecondRow]);
  });

  it('rejects an operation without a fixed execution order', () => {
    expect(() =>
      orderPersistenceOperations([operation('Unknown', 1)], new Map()),
    ).toThrow('execution schedule');
  });
});
