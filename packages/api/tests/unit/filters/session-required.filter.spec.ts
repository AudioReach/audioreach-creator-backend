/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {HttpStatus} from '@nestjs/common';
import type {ArgumentsHost} from '@nestjs/common';
import {SessionRequiredFilter} from '../../../src/filters/session-required.filter.js';
import {SessionRequiredError} from '@arc/core';

function makeHost(json: jest.Mock): ArgumentsHost {
  const res = {status: jest.fn().mockReturnThis(), json};
  return {
    switchToHttp: () => ({getResponse: () => res}),
  } as unknown as ArgumentsHost;
}

describe('SessionRequiredFilter', () => {
  let filter: SessionRequiredFilter;

  beforeEach(() => {
    filter = new SessionRequiredFilter();
  });

  it('responds with 403 and SESSION_NOT_OPEN body', () => {
    const json = jest.fn();
    filter.catch(
      new SessionRequiredError('PatchSpfModuleCommand'),
      makeHost(json),
    );
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.FORBIDDEN,
      errorCode: 'SESSION_NOT_OPEN',
      message: 'PatchSpfModuleCommand requires an active session',
    });
  });

  it('uses the command name from the error', () => {
    const json = jest.fn();
    filter.catch(new SessionRequiredError('EndSessionCommand'), makeHost(json));
    const body = json.mock.calls[0][0] as Record<string, unknown>;
    expect(body['message']).toBe(
      'EndSessionCommand requires an active session',
    );
  });
});
