/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {HttpStatus} from '@nestjs/common';
import {of} from 'rxjs';
import {lastValueFrom} from 'rxjs';
import {IssueSeverity} from '@arc/core';
import {PartialSuccessInterceptor} from '../../../../../../src/presentation/rest/common/interceptors/partial-success.interceptor.js';

describe('PartialSuccessInterceptor', () => {
  let interceptor: PartialSuccessInterceptor;
  let mockResponse: {status: jest.Mock};
  let mockContext: {
    switchToHttp: () => {
      getResponse: () => typeof mockResponse;
    };
  };

  beforeEach(() => {
    interceptor = new PartialSuccessInterceptor();
    mockResponse = {status: jest.fn().mockReturnThis()};
    mockContext = {
      switchToHttp: () => ({getResponse: () => mockResponse}),
    };
  });

  async function run(body: unknown): Promise<unknown> {
    const handler = {handle: () => of(body)};
    return lastValueFrom(interceptor.intercept(mockContext as any, handler));
  }

  it('keeps status 200 when the body has no issues field', async () => {
    await run({data: [1, 2, 3]});
    expect(mockResponse.status).not.toHaveBeenCalled();
  });

  it('keeps status 200 when issues[] is empty', async () => {
    await run({data: [1, 2, 3], issues: []});
    expect(mockResponse.status).not.toHaveBeenCalled();
  });

  it('keeps status 200 when issues only contain WARNING severity', async () => {
    await run({
      data: [1, 2, 3],
      issues: [
        {
          code: 'ARC-INSERT-MOD-002',
          message: 'dropped',
          severity: IssueSeverity.Warning,
        },
      ],
    });
    expect(mockResponse.status).not.toHaveBeenCalled();
  });

  it('upgrades to 207 Multi-Status when at least one ERROR-severity issue is present', async () => {
    await run({
      data: [1, 2],
      issues: [
        {
          code: 'ENTITY_NOT_FOUND',
          message: 'missing',
          severity: IssueSeverity.Error,
        },
      ],
    });
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.MULTI_STATUS);
  });

  it('upgrades to 207 when at least one FATAL-severity issue is present', async () => {
    await run({
      data: [],
      issues: [
        {
          code: 'DB_QUERY_FAILED',
          message: 'boom',
          severity: IssueSeverity.Fatal,
        },
      ],
    });
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.MULTI_STATUS);
  });

  it('upgrades to 207 when issues[] has mixed WARNING + ERROR', async () => {
    await run({
      data: [1],
      issues: [
        {
          code: 'ARC-INSERT-MOD-002',
          message: 'dropped',
          severity: IssueSeverity.Warning,
        },
        {
          code: 'ENTITY_NOT_FOUND',
          message: 'missing',
          severity: IssueSeverity.Error,
        },
      ],
    });
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.MULTI_STATUS);
  });

  it('ignores non-object bodies (null, primitive)', async () => {
    await run(null);
    await run('a string');
    await run(42);
    expect(mockResponse.status).not.toHaveBeenCalled();
  });
});
