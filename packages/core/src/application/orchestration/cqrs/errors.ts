/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SessionMode} from '../../shared/change-vocabulary.js';

/**
 * Thrown by CommandBus when a command declares `requiresSession = true`
 * but no ActiveSession was passed to `execute()`.
 * Mapped to HTTP 403 by SessionRequiredFilter in @arc/api (§7a.5).
 */
export class SessionRequiredError extends Error {
  override readonly name = 'SessionRequiredError';

  constructor(public readonly commandName: string) {
    super(
      `Command '${commandName}' requires an active session but none was provided. ` +
        `Ensure the endpoint applies @UseGuards(SessionGuard) and the session is active.`,
    );
  }
}

/**
 * Thrown by CommandBus when a command declares `allowedModes` and the
 * active session's mode is not in that list.
 * Mapped to HTTP 403 by SessionModeNotAllowedFilter in @arc/api (§7a.5).
 */
export class SessionModeNotAllowedError extends Error {
  override readonly name = 'SessionModeNotAllowedError';

  constructor(
    public readonly commandName: string,
    public readonly currentMode: SessionMode,
    public readonly allowedModes: readonly SessionMode[],
  ) {
    super(
      `Command '${commandName}' is not allowed in session mode '${currentMode}'. ` +
        `Allowed modes: [${allowedModes.join(', ')}].`,
    );
  }
}
