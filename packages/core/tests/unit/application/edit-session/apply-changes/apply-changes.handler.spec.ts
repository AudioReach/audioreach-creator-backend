/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import type {UnitOfWork} from '../../../../../src/application/ports/persistence/unit-of-work.js';
import {RESULT_KIND} from '../../../../../src/application/shared/result/result.js';
import {ApplyChangesCommand} from '../../../../../src/application/edit-session/apply-changes/apply-changes.command.js';
import {ApplyChangesHandler} from '../../../../../src/application/edit-session/apply-changes/apply-changes.handler.js';

function uow(): jest.Mocked<UnitOfWork> {
  return {
    startTransaction: jest.fn(async () => undefined),
    commit: jest.fn(async () => undefined),
    rollback: jest.fn(async () => undefined),
    isInTransaction: jest.fn(() => true),
    applyChanges: jest.fn(async () => undefined),
  } as unknown as jest.Mocked<UnitOfWork>;
}

describe('ApplyChangesHandler', () => {
  it('owns the transaction and returns an empty successful result', async () => {
    const unitOfWork = uow();
    const result = await new ApplyChangesHandler(unitOfWork).handle(
      new ApplyChangesCommand('1'),
    );

    expect(unitOfWork.startTransaction).toHaveBeenCalledTimes(1);
    expect(unitOfWork.applyChanges).toHaveBeenCalledTimes(1);
    expect(unitOfWork.commit).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind === RESULT_KIND.Ok) expect(result.data).toEqual({});
  });

  it('rolls back and rethrows an apply failure', async () => {
    const unitOfWork = uow();
    unitOfWork.applyChanges.mockRejectedValue(new Error('apply failed'));

    await expect(
      new ApplyChangesHandler(unitOfWork).handle(new ApplyChangesCommand('1')),
    ).rejects.toThrow('apply failed');
    expect(unitOfWork.rollback).toHaveBeenCalledTimes(1);
    expect(unitOfWork.commit).not.toHaveBeenCalled();
  });

  it('requires a session and accepts every active mode', () => {
    expect(ApplyChangesCommand.requiresSession).toBe(true);
    expect(ApplyChangesCommand.allowedModes).toEqual([]);
  });
});
