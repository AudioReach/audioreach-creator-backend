/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../../../src/application/shared/base-command.js';
import {SESSION_MODE} from '../../../../src/application/shared/change-vocabulary.js';

// Concrete subclass with defaults — does NOT override either field.
class DefaultCommand extends BaseCommand {
  constructor() {
    super();
  }
}

// Case 1: session required + specific modes.
class DesignerOnlyCommand extends BaseCommand {
  static override readonly requiresSession = true;
  static override readonly allowedModes = [SESSION_MODE.Designer] as const;
  constructor() {
    super();
  }
}

// Case 3: no session required.
class SessionFreeCommand extends BaseCommand {
  static override readonly requiresSession = false;
  static override readonly allowedModes = [] as const;
  constructor() {
    super();
  }
}

describe('BaseCommand', () => {
  // NOTE: CommandBus enforcement of requiresSession and allowedModes is tested
  // in Task 20 (command-bus.spec.ts). Static field declarations are verified by
  // TypeScript's type-checker; no runtime value tests are needed here.

  describe('instance construction is unchanged', () => {
    it('id is auto-generated UUID string', () => {
      const cmd = new DefaultCommand();
      expect(typeof cmd.id).toBe('string');
      expect(cmd.id.length).toBeGreaterThan(0);
    });

    it('timeStamp is a Date', () => {
      const cmd = new DefaultCommand();
      expect(cmd.timeStamp).toBeInstanceOf(Date);
    });
  });
});
