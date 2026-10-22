/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import type {UnitOfWork} from '../../../../../src/application/ports/persistence/unit-of-work.js';
import {RESULT_KIND} from '../../../../../src/application/shared/result/result.js';
import {DiscardChangesCommand} from '../../../../../src/application/edit-session/discard-changes/discard-changes.command.js';
import {DiscardChangesHandler} from '../../../../../src/application/edit-session/discard-changes/discard-changes.handler.js';

function uow(): jest.Mocked<UnitOfWork> {
  return {
    startTransaction: jest.fn(async () => undefined),
    commit: jest.fn(async () => undefined),
    rollback: jest.fn(async () => undefined),
    isInTransaction: jest.fn(() => true),
    discardChanges: jest.fn(async () => undefined),
  } as unknown as jest.Mocked<UnitOfWork>;
}

describe('DiscardChangesHandler', () => {
  it('owns the transaction and returns an empty successful result', async () => {
    const unitOfWork = uow();
    const result = await new DiscardChangesHandler(unitOfWork).handle(
      new DiscardChangesCommand('1'),
    );

    expect(unitOfWork.startTransaction).toHaveBeenCalledTimes(1);
    expect(unitOfWork.discardChanges).toHaveBeenCalledTimes(1);
    expect(unitOfWork.commit).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind === RESULT_KIND.Ok) expect(result.data).toEqual({});
  });

  it('rolls back and rethrows a discard failure', async () => {
    const unitOfWork = uow();
    unitOfWork.discardChanges.mockRejectedValue(new Error('discard failed'));

    await expect(
      new DiscardChangesHandler(unitOfWork).handle(
        new DiscardChangesCommand('1'),
      ),
    ).rejects.toThrow('discard failed');
    expect(unitOfWork.rollback).toHaveBeenCalledTimes(1);
  });

  it('requires a session and accepts every active mode', () => {
    expect(DiscardChangesCommand.requiresSession).toBe(true);
    expect(DiscardChangesCommand.allowedModes).toEqual([]);
  });
});
