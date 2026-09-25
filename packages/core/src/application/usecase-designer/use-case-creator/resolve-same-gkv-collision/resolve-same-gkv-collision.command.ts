/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../../../application/shared/base-command.js';
import {
  SESSION_MODE,
  SOURCE,
} from '../../../../application/shared/change-vocabulary.js';
import type {CollisionResolutionMode} from '../contracts/same-gkv-collision.js';
import {parseResolveSameGkvCollisionPayload} from '../contracts/fix-command-input.js';
import type {RoutingSelection} from '../contracts/routing-input.js';

export class ResolveSameGkvCollisionCommand extends BaseCommand {
  static override readonly requiresSession = true;
  static override readonly allowedModes = [
    SESSION_MODE.Designer,
    SESSION_MODE.DiffMerge,
  ] as const;

  readonly source = SOURCE.Manual;

  constructor(
    public readonly mode: CollisionResolutionMode,
    public readonly collisionId: string,
    public readonly replayInput: RoutingSelection,
  ) {
    super();
  }

  static fromPayload(
    payload: Record<string, unknown>,
  ): ResolveSameGkvCollisionCommand {
    const parsed = parseResolveSameGkvCollisionPayload(payload);
    return new ResolveSameGkvCollisionCommand(
      parsed.mode,
      parsed.collisionId,
      parsed.replayInput,
    );
  }
}
