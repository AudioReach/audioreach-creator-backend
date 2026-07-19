/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Command} from '../orchestration/cqrs/commands/command.js';
import type {SessionMode} from '../shared/change-vocabulary.js';
import {generateUuid} from '../../shared/utilities/uuid.js';

/**
 * Base abstract class for commands with auto-generated ID and timestamp.
 *
 * Static fields declare session requirements for CommandBus enforcement (§7a.2):
 *   - requiresSession: true  → CommandBus throws SessionRequiredError if no session passed.
 *   - allowedModes: []       → empty means any mode is accepted (only checked when
 *                              requiresSession = true and a session is present).
 *
 * Subclasses override only the fields relevant to their case:
 *   Case 1 — session + specific modes: override both fields.
 *   Case 2 — session + any mode:       inherit defaults (requiresSession = true, allowedModes = []).
 *   Case 3 — no session required:      override requiresSession = false, keep allowedModes = [].
 *
 * Constructor signature is unchanged — always takes clientId.
 */
export abstract class BaseCommand implements Command {
  /**
   * Safest default: every command requires an active session unless it
   * explicitly opts out with `static override readonly requiresSession = false`.
   */
  static readonly requiresSession: boolean = true;

  /**
   * Operating modes in which this command is permitted.
   * Empty array means any mode is accepted (Case 2 default).
   * Only consulted by CommandBus when requiresSession = true and a session is present.
   */
  static readonly allowedModes: readonly SessionMode[] = [];

  readonly id: string;
  readonly timeStamp: Date = new Date();

  constructor(public readonly clientId: string) {
    this.id = generateUuid();
  }
}
