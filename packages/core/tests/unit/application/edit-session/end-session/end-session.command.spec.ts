/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EndSessionCommand} from '../../../../../src/application/edit-session/end-session/end-session.command.js';

describe('EndSessionCommand', () => {
  it('stores all constructor arguments and inherits from BaseCommand', () => {
    const cmd = new EndSessionCommand('proj-123');
    expect(cmd.projectId).toBe('proj-123');
    expect(typeof cmd.id).toBe('string');
    expect(cmd.timeStamp).toBeInstanceOf(Date);
  });
});
