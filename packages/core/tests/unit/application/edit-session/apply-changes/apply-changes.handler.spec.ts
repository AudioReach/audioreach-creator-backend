/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {RESULT_KIND} from '@arc/core';
import type {ApplyChangesSummary, UnitOfWork} from '@arc/core';
import {ApplyChangesCommand} from '../../../../../src/application/edit-session/apply-changes/apply-changes.command.js';
import {ApplyChangesHandler} from '../../../../../src/application/edit-session/apply-changes/apply-changes.handler.js';

function createUow(summary: ApplyChangesSummary) {
  let inTransaction = false;
  const uow = {
    startTransaction: jest.fn(async () => {
      inTransaction = true;
    }),
    commit: jest.fn(async () => {
      inTransaction = false;
    }),
    rollback: jest.fn(async () => {
      inTransaction = false;
    }),
    isInTransaction: jest.fn(() => inTransaction),
    applyChanges: jest.fn(async () => summary),
  } as unknown as jest.Mocked<UnitOfWork>;
  return uow;
}

describe('ApplyChangesHandler', () => {
  const summary: ApplyChangesSummary = {
    commitId: 7,
    appliedEntityCount: 3,
    appliedAggregateCount: 2,
  };

  it('runs apply in one transaction and returns a successful result', async () => {
    const uow = createUow(summary);

    await expect(
      new ApplyChangesHandler(uow).handle(new ApplyChangesCommand()),
    ).resolves.toEqual({kind: RESULT_KIND.Ok, data: summary});

    expect(uow.startTransaction).toHaveBeenCalledTimes(1);
    expect(uow.applyChanges).toHaveBeenCalledTimes(1);
    expect(uow.commit).toHaveBeenCalledTimes(1);
    expect(uow.rollback).not.toHaveBeenCalled();
  });

  it('rolls back and rethrows when apply fails', async () => {
    const uow = createUow(summary);
    const failure = new Error('apply failed');
    uow.applyChanges.mockRejectedValueOnce(failure);

    await expect(
      new ApplyChangesHandler(uow).handle(new ApplyChangesCommand()),
    ).rejects.toBe(failure);

    expect(uow.rollback).toHaveBeenCalledTimes(1);
    expect(uow.commit).not.toHaveBeenCalled();
  });

  it('rolls back and rethrows when commit fails', async () => {
    const uow = createUow(summary);
    const failure = new Error('commit failed');
    uow.commit.mockRejectedValueOnce(failure);

    await expect(
      new ApplyChangesHandler(uow).handle(new ApplyChangesCommand()),
    ).rejects.toBe(failure);

    expect(uow.rollback).toHaveBeenCalledTimes(1);
  });

  it('requires an active session and accepts every active mode', () => {
    expect(ApplyChangesCommand.requiresSession).toBe(true);
    expect(ApplyChangesCommand.allowedModes).toEqual([]);
  });
});
