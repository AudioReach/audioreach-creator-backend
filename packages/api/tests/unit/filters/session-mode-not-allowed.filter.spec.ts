/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {HttpStatus} from '@nestjs/common';
import type {ArgumentsHost} from '@nestjs/common';
import {SessionModeNotAllowedFilter} from '../../../src/filters/session-mode-not-allowed.filter.js';
import {SessionModeNotAllowedError, SESSION_MODE} from '@arc/core';

function makeHost(json: jest.Mock): ArgumentsHost {
  const res = {status: jest.fn().mockReturnThis(), json};
  return {
    switchToHttp: () => ({getResponse: () => res}),
  } as unknown as ArgumentsHost;
}

describe('SessionModeNotAllowedFilter', () => {
  let filter: SessionModeNotAllowedFilter;

  beforeEach(() => {
    filter = new SessionModeNotAllowedFilter();
  });

  it('responds with 403 and SESSION_MODE_NOT_ALLOWED body', () => {
    const json = jest.fn();
    const error = new SessionModeNotAllowedError(
      'PatchSpfModuleCommand',
      SESSION_MODE.Tuning,
      [SESSION_MODE.Designer],
    );
    filter.catch(error, makeHost(json));
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.FORBIDDEN,
      errorCode: 'SESSION_MODE_NOT_ALLOWED',
      message:
        'PatchSpfModuleCommand is not allowed in mode TUNING. Allowed modes: [DESIGNER]',
      commandName: 'PatchSpfModuleCommand',
      currentMode: SESSION_MODE.Tuning,
      allowedModes: [SESSION_MODE.Designer],
    });
  });

  it('lists multiple allowed modes joined by comma', () => {
    const json = jest.fn();
    const error = new SessionModeNotAllowedError(
      'AddModuleCommand',
      SESSION_MODE.Tuning,
      [SESSION_MODE.Designer, SESSION_MODE.DiffMerge],
    );
    filter.catch(error, makeHost(json));
    const body = json.mock.calls[0][0] as Record<string, unknown>;
    expect(body['message']).toBe(
      'AddModuleCommand is not allowed in mode TUNING. Allowed modes: [DESIGNER, DIFF_MERGE]',
    );
    expect(body['allowedModes']).toEqual([
      SESSION_MODE.Designer,
      SESSION_MODE.DiffMerge,
    ]);
  });
});
