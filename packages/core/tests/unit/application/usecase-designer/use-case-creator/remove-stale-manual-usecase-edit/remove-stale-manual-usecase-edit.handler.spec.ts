/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {RemoveStaleManualUsecaseEditCommand} from '../../../../../../src/application/usecase-designer/use-case-creator/remove-stale-manual-usecase-edit/remove-stale-manual-usecase-edit.command.js';
import {RemoveStaleManualUsecaseEditHandler} from '../../../../../../src/application/usecase-designer/use-case-creator/remove-stale-manual-usecase-edit/remove-stale-manual-usecase-edit.handler.js';

function makeUow() {
  const deleteEditActionsByChangeIds = jest.fn(async () => 2);
  const rollback = jest.fn(async () => undefined);
  return {
    uow: {
      startTransaction: jest.fn(async () => undefined),
      commit: jest.fn(async () => undefined),
      rollback,
      isInTransaction: jest.fn(() => true),
      getWriteContext: () => ({session: {sessionId: 7}}),
      getSessionRepository: () => ({deleteEditActionsByChangeIds}),
    },
    deleteEditActionsByChangeIds,
    rollback,
  };
}

describe('RemoveStaleManualUsecaseEditHandler', () => {
  it('sorts and deduplicates IDs at the command boundary and commits removal', async () => {
    const {uow, deleteEditActionsByChangeIds} = makeUow();
    const handler = new RemoveStaleManualUsecaseEditHandler(uow as never);

    const command = RemoveStaleManualUsecaseEditCommand.fromPayload({
      changeIds: [9, 3, 9, 5],
    });
    await handler.handle(command);

    expect(deleteEditActionsByChangeIds).toHaveBeenCalledWith(7, [3, 5, 9]);
    expect(uow.commit).toHaveBeenCalledTimes(1);
  });

  it('rejects an empty ID payload', () => {
    expect(() =>
      RemoveStaleManualUsecaseEditCommand.fromPayload({changeIds: []}),
    ).toThrow();
  });

  it('rolls back when removal fails', async () => {
    const {uow, deleteEditActionsByChangeIds, rollback} = makeUow();
    deleteEditActionsByChangeIds.mockRejectedValue(new Error('failed'));
    const handler = new RemoveStaleManualUsecaseEditHandler(uow as never);

    await expect(
      handler.handle(new RemoveStaleManualUsecaseEditCommand([1])),
    ).rejects.toThrow('failed');
    expect(rollback).toHaveBeenCalledTimes(1);
  });
});
