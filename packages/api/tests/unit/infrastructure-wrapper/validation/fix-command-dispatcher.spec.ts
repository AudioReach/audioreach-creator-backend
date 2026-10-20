/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {InvalidInputException} from '@arc/core';
import {FixCommandDispatcher} from '../../../../src/infrastructure-wrapper/validation/fix-command-dispatcher.js';

describe('FixCommandDispatcher', () => {
  it('does not dispatch an unregistered command type', () => {
    const dispatcher = new FixCommandDispatcher();

    expect(dispatcher.resolve('DeleteDataLinkCommand')).toBeUndefined();
  });

  it('create throws InvalidInputException for an unregistered command type', () => {
    const dispatcher = new FixCommandDispatcher();

    expect(() => dispatcher.create('DeleteDataLinkCommand', {})).toThrow(
      InvalidInputException,
    );
  });

  it('create builds the command for a registered command type', () => {
    const dispatcher = new FixCommandDispatcher();

    const command = dispatcher.create('RemoveCkvsCommand', {
      spfModuleSystemId: '1',
      ckvSystemIds: ['10'],
    });

    expect(command.constructor.name).toBe('RemoveCkvsCommand');
  });
});
