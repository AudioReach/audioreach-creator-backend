/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION} from '@arc/core';
import type {PlannedMutation} from '@arc/core';
import {
  getTestDataSource,
  setupEachTest,
  setupIntegrationTest,
  teardownIntegrationTest,
} from '../helpers/test-database-setup.js';
import {TypeOrmOperationExecutor} from '../../../src/persistence-typeorm-sqllite/services/apply-changes/typeorm-operation-executor.js';
import {createDefaultApplyTargetRegistry} from '../../../src/persistence-typeorm-sqllite/services/apply-changes/apply-target-registry.js';

function mutation(
  operation: PlannedMutation['operation'],
  systemId: number,
  values?: Readonly<Record<string, unknown>>,
): PlannedMutation {
  return {
    targetType: 'UseCaseCategory',
    mutationKey: `UseCaseCategory:${systemId}`,
    aggregateId: systemId,
    operation,
    criteria: {systemId},
    values,
    executionSlot: {
      phase:
        operation === CHANGE_OPERATION.Delete
          ? 1
          : operation === CHANGE_OPERATION.Update
            ? 4
            : 4,
      step: 1,
    },
  };
}

describe('TypeOrmOperationExecutor', () => {
  beforeAll(setupIntegrationTest);
  afterAll(teardownIntegrationTest);
  beforeEach(setupEachTest);

  it('executes create, update, and delete with prepared criteria', async () => {
    const dataSource = getTestDataSource();
    const executor = new TypeOrmOperationExecutor(
      dataSource.manager,
      createDefaultApplyTargetRegistry(),
    );

    await executor.execute(
      mutation(CHANGE_OPERATION.Create, 700, {
        systemId: 700,
        name: 'Initial',
      }),
    );
    await executor.execute(
      mutation(CHANGE_OPERATION.Update, 700, {name: 'Updated'}),
    );

    expect(
      await dataSource.manager.getRepository('UseCaseCategory').findOneBy({
        systemId: 700,
      }),
    ).toMatchObject({systemId: 700, name: 'Updated'});

    await executor.execute(mutation(CHANGE_OPERATION.Delete, 700));
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
        mutation(CHANGE_OPERATION.Update, 999, {name: 'Missing'}),
      ),
    ).rejects.toThrow('Expected one updated row, affected 0');
  });

  it('rejects an unregistered target before writing', async () => {
    const executor = new TypeOrmOperationExecutor(
      getTestDataSource().manager,
      createDefaultApplyTargetRegistry(),
    );
    const invalid = {
      ...mutation(CHANGE_OPERATION.Create, 1, {systemId: 1}),
      targetType: 'ProjectSession',
      mutationKey: 'ProjectSession:1',
    };

    await expect(executor.execute(invalid)).rejects.toThrow(
      'Unsupported apply target',
    );
  });
});

