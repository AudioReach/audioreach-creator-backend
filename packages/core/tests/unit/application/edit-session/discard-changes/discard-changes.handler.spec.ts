/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {RESULT_KIND} from '../../../../../src/index.js';
import type {
  DiscardChangesSummary,
  UnitOfWork,
} from '../../../../../src/index.js';
import {DiscardChangesCommand} from '../../../../../src/application/edit-session/discard-changes/discard-changes.command.js';
import {DiscardChangesHandler} from '../../../../../src/application/edit-session/discard-changes/discard-changes.handler.js';

function createUow(summary: DiscardChangesSummary) {
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
    discardChanges: jest.fn(async () => summary),
  } as unknown as jest.Mocked<UnitOfWork>;
  return uow;
}

describe('DiscardChangesHandler', () => {
  it('deletes the complete session action set in one transaction', async () => {
    const summary = {discardedEditActionCount: 4};
    const uow = createUow(summary);

    await expect(
      new DiscardChangesHandler(uow).handle(new DiscardChangesCommand()),
    ).resolves.toEqual({kind: RESULT_KIND.Ok, data: summary});

    expect(uow.startTransaction).toHaveBeenCalledTimes(1);
    expect(uow.discardChanges).toHaveBeenCalledTimes(1);
    expect(uow.commit).toHaveBeenCalledTimes(1);
    expect(uow.rollback).not.toHaveBeenCalled();
  });

  it('rolls back when discard fails', async () => {
    const uow = createUow({discardedEditActionCount: 0});
    const failure = new Error('discard failed');
    uow.discardChanges.mockRejectedValueOnce(failure);

    await expect(
      new DiscardChangesHandler(uow).handle(new DiscardChangesCommand()),
    ).rejects.toBe(failure);

    expect(uow.rollback).toHaveBeenCalledTimes(1);
    expect(uow.commit).not.toHaveBeenCalled();
  });

  it('requires an active session and allows every active mode', () => {
    expect(DiscardChangesCommand.requiresSession).toBe(true);
    expect(DiscardChangesCommand.allowedModes).toEqual([]);
  });
});
