/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION} from '@arc/core';
import type {MainTableEntityWriteOperation} from '../../../src/persistence-typeorm-sqllite/services/apply-changes/apply-changes.types.js';
import {createDefaultApplyTargetRegistry} from '../../../src/persistence-typeorm-sqllite/services/apply-changes/apply-target-registry.js';
import {TypeOrmOperationExecutor} from '../../../src/persistence-typeorm-sqllite/services/apply-changes/typeorm-operation-executor.js';
import {
  getTestDataSource,
  setupEachTest,
  setupIntegrationTest,
  teardownIntegrationTest,
} from '../helpers/test-database-setup.js';

function operation(
  changeOperation: MainTableEntityWriteOperation['operation'],
  systemId: number,
  values: Readonly<Record<string, unknown>> = {},
): MainTableEntityWriteOperation {
  const base = {
    aggregateId: systemId,
    target: {
      entityName: 'UseCaseCategory',
      rowIdentifier: {
        kind: 'SYSTEM_ID' as const,
        values: {systemId},
      },
    },
  };
  if (changeOperation === CHANGE_OPERATION.Update) {
    return {...base, operation: changeOperation, changes: values};
  }
  if (changeOperation === CHANGE_OPERATION.Delete) {
    return {...base, operation: changeOperation};
  }
  return {...base, operation: changeOperation, values};
}

describe('TypeOrmOperationExecutor', () => {
  beforeAll(setupIntegrationTest);
  afterAll(teardownIntegrationTest);
  beforeEach(setupEachTest);

  it('executes create, update, and delete with the resolved row identity', async () => {
    const dataSource = getTestDataSource();
    const executor = new TypeOrmOperationExecutor(
      dataSource.manager,
      createDefaultApplyTargetRegistry(),
    );

    await executor.execute(
      operation(CHANGE_OPERATION.Create, 700, {name: 'Initial'}),
    );
    await executor.execute(
      operation(CHANGE_OPERATION.Update, 700, {name: 'Updated'}),
    );

    expect(
      await dataSource.manager.getRepository('UseCaseCategory').findOneBy({
        systemId: 700,
      }),
    ).toMatchObject({systemId: 700, name: 'Updated'});

    await executor.execute(operation(CHANGE_OPERATION.Delete, 700));
    expect(
      await dataSource.manager.getRepository('UseCaseCategory').findOneBy({
        systemId: 700,
      }),
    ).toBeNull();
  });

  it('rejects an update that affects no row', async () => {
    const executor = new TypeOrmOperationExecutor(
      getTestDataSource().manager,
      createDefaultApplyTargetRegistry(),
    );

    await expect(
      executor.execute(
        operation(CHANGE_OPERATION.Update, 999, {name: 'Missing'}),
      ),
    ).rejects.toThrow('Expected one updated row, affected 0');
  });

  it('rejects an unregistered target before writing', async () => {
    const executor = new TypeOrmOperationExecutor(
      getTestDataSource().manager,
      createDefaultApplyTargetRegistry(),
    );
    const invalid: MainTableEntityWriteOperation = {
      ...operation(CHANGE_OPERATION.Create, 1),
      target: {
        entityName: 'ProjectSession',
        rowIdentifier: {kind: 'SYSTEM_ID', values: {systemId: 1}},
      },
    };

    expect(() => executor.validateOperations([invalid])).toThrow(
      'Unsupported apply target',
    );
  });
});
