/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {WriteContext} from '@arc/core';

type DiscardSessionRepository = {
  deleteAllEditActionsForSession(sessionId: number): Promise<number>;
};

export class TypeOrmDiscardChangesService {
  constructor(
    private readonly writeContext: WriteContext,
    private readonly sessionRepository: DiscardSessionRepository,
  ) {}

  async discard(): Promise<void> {
    await this.sessionRepository.deleteAllEditActionsForSession(
      this.writeContext.session.sessionId,
    );
  }
}
