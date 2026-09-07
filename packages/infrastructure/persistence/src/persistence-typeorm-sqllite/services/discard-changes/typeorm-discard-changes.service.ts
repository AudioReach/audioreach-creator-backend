/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DiscardChangesSummary, WriteContext} from '@arc/core';

type DiscardSessionRepository = {
  deleteAllEditActions(sessionId: number): Promise<number>;
};

/**
 * Deletes the complete edit-action set for the active session. The caller's
 * UnitOfWork owns the transaction; this service only performs the persistence
 * operation on that transaction-bound repository.
 */
export class TypeOrmDiscardChangesService {
  constructor(
    private readonly writeContext: WriteContext,
    private readonly sessionRepository: DiscardSessionRepository,
  ) {}

  async discard(): Promise<DiscardChangesSummary> {
    const sessionId = this.writeContext.session.sessionId;
    const discardedEditActionCount =
      await this.sessionRepository.deleteAllEditActions(sessionId);

    return {discardedEditActionCount};
  }
}
