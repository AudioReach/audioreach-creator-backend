/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import type {ApplyChangesPort, ApplyChangesResult, UnitOfWork} from '@arc/core';
import {ApplyChangesCommand} from '../../../../../src/application/edit-session/apply-changes/apply-changes.command.js';
import {ApplyChangesHandler} from '../../../../../src/application/edit-session/apply-changes/apply-changes.handler.js';

function createUow(result: ApplyChangesResult) {
  let inTransaction = false;
  const applyPort: ApplyChangesPort = {
    apply: jest.fn(async () => result),
  };
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
    getApplyChangesPort: jest.fn(() => applyPort),
    applyCachedActions: jest.fn(async () => undefined),
  } as unknown as jest.Mocked<UnitOfWork> & {
    getApplyChangesPort: jest.Mock<() => ApplyChangesPort>;
  };
  return {uow, applyPort};
}

describe('ApplyChangesHandler', () => {
  const result: ApplyChangesResult = {
    commitId: 7,
    appliedEntityCount: 3,
    appliedAggregateCount: 2,
  };

  it('runs apply in one transaction and returns the direct result', async () => {
    const {uow, applyPort} = createUow(result);

    await expect(
      new ApplyChangesHandler(uow).handle(new ApplyChangesCommand()),
    ).resolves.toEqual(result);

    expect(uow.startTransaction).toHaveBeenCalledTimes(1);
    expect(applyPort.apply).toHaveBeenCalledTimes(1);
    expect(uow.commit).toHaveBeenCalledTimes(1);
    expect(uow.rollback).not.toHaveBeenCalled();
    expect(uow.applyCachedActions).not.toHaveBeenCalled();
  });

  it('rolls back and rethrows when apply fails', async () => {
    const {uow, applyPort} = createUow(result);
    const failure = new Error('apply failed');
    jest.mocked(applyPort.apply).mockRejectedValueOnce(failure);

    await expect(
      new ApplyChangesHandler(uow).handle(new ApplyChangesCommand()),
    ).rejects.toBe(failure);

    expect(uow.rollback).toHaveBeenCalledTimes(1);
    expect(uow.commit).not.toHaveBeenCalled();
  });

  it('rolls back and rethrows when commit fails', async () => {
    const {uow} = createUow(result);
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
