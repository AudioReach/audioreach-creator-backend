/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {FixCommandDispatcher} from '../../../../src/infrastructure-wrapper/validation/fix-command-dispatcher.js';

describe('FixCommandDispatcher', () => {
  it('does not dispatch an unregistered command type', () => {
    const dispatcher = new FixCommandDispatcher();

    expect(dispatcher.resolve('DeleteDataLinkCommand')).toBeUndefined();
  });
});
