/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {RemoveCkvsCommand} from '../../../../../../src/application/usecase-designer/spf-module/remove-ckvs/remove-ckvs.command.js';
import {InvalidInputException} from '../../../../../../src/shared/exceptions/invalid-input.exception.js';

describe('RemoveCkvsCommand.fromPayload', () => {
  it('constructs command with correct ids', () => {
    const cmd = RemoveCkvsCommand.fromPayload({
      spfModuleSystemId: '5',
      ckvSystemIds: ['10', '20'],
    });
    expect(cmd.spfModuleSystemId).toBe(5);
    expect(cmd.ckvSystemIds).toEqual([10, 20]);
  });

  it('throws InvalidInputException when ckvSystemIds is missing', () => {
    expect(() =>
      RemoveCkvsCommand.fromPayload({spfModuleSystemId: '5'}),
    ).toThrow(InvalidInputException);
  });

  it('throws on invalid spfModuleSystemId', () => {
    expect(() =>
      RemoveCkvsCommand.fromPayload({
        spfModuleSystemId: 'abc',
        ckvSystemIds: [],
      }),
    ).toThrow(InvalidInputException);
  });
});
