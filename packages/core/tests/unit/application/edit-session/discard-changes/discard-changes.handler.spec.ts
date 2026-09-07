/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import type {
  DiscardChangesPort,
  DiscardChangesResult,
  UnitOfWork,
} from '../../../../../src/index.js';
import {DiscardChangesCommand} from '../../../../../src/application/edit-session/discard-changes/discard-changes.command.js';
import {DiscardChangesHandler} from '../../../../../src/application/edit-session/discard-changes/discard-changes.handler.js';

function createUow(result: DiscardChangesResult) {
  let inTransaction = false;
  const discardPort: DiscardChangesPort = {
    discard: jest.fn(async () => result),
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
    getDiscardChangesPort: jest.fn(() => discardPort),
  } as unknown as jest.Mocked<UnitOfWork> & {
    getDiscardChangesPort: jest.Mock<() => DiscardChangesPort>;
  };
  return {uow, discardPort};
}

describe('DiscardChangesHandler', () => {
  it('deletes the complete session action set in one transaction', async () => {
    const {uow, discardPort} = createUow({discardedEditActionCount: 4});

    await expect(
      new DiscardChangesHandler(uow).handle(new DiscardChangesCommand()),
    ).resolves.toEqual({discardedEditActionCount: 4});

    expect(uow.startTransaction).toHaveBeenCalledTimes(1);
    expect(discardPort.discard).toHaveBeenCalledTimes(1);
    expect(uow.commit).toHaveBeenCalledTimes(1);
    expect(uow.rollback).not.toHaveBeenCalled();
  });

  it('rolls back when discard fails', async () => {
    const {uow, discardPort} = createUow({discardedEditActionCount: 0});
    const failure = new Error('discard failed');
    jest.mocked(discardPort.discard).mockRejectedValueOnce(failure);

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
