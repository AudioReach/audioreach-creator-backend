/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {TypeOrmDiscardChangesService} from '../../../src/persistence-typeorm-sqllite/services/apply-changes/typeorm-discard-changes.service.js';

describe('TypeOrmDiscardChangesService', () => {
  it('deletes every edit action for the active session', async () => {
    const deleteAllEditActionsForSession = jest.fn(async () => 3);
    const service = new TypeOrmDiscardChangesService(
      {session: {sessionId: 9}} as never,
      {deleteAllEditActionsForSession},
    );

    await expect(service.discard()).resolves.toBeUndefined();
    expect(deleteAllEditActionsForSession).toHaveBeenCalledWith(9);
  });

  it('treats an empty session as a successful discard', async () => {
    const service = new TypeOrmDiscardChangesService(
      {session: {sessionId: 9}} as never,
      {deleteAllEditActionsForSession: async () => 0},
    );

    await expect(service.discard()).resolves.toBeUndefined();
  });
});
