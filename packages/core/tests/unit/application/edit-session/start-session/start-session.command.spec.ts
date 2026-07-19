/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {StartSessionCommand} from '../../../../../src/application/edit-session/start-session/start-session.command.js';
import {SESSION_MODE} from '../../../../../src/application/shared/change-vocabulary.js';

describe('StartSessionCommand', () => {
  it('stores all constructor arguments and inherits from BaseCommand', () => {
    const cmd = new StartSessionCommand(
      'proj-123',
      'client-abc',
      SESSION_MODE.Designer,
      'user-xyz',
    );
    expect(cmd.projectId).toBe('proj-123');
    expect(cmd.clientId).toBe('client-abc');
    expect(cmd.mode).toBe(SESSION_MODE.Designer);
    expect(cmd.userId).toBe('user-xyz');
    expect(typeof cmd.id).toBe('string');
    expect(cmd.timeStamp).toBeInstanceOf(Date);
  });

  it('allows userId to be omitted', () => {
    const cmd = new StartSessionCommand(
      'proj-123',
      'client-abc',
      SESSION_MODE.Tuning,
    );
    expect(cmd.userId).toBeUndefined();
  });
});
