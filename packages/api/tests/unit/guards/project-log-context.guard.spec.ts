/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ExecutionContext} from '@nestjs/common';
import {AsyncLocalStorageLogContextProvider} from '@arc/logger';
import type {ActiveLogContext} from '@arc/logger';
import {
  MAX_LOGGED_PROJECT_ID_LENGTH,
  ProjectLogContextGuard,
} from '../../../src/guards/project-log-context.guard.js';

const LAUNCH = '6aa7bf9e-2d6f-4df7-b87b-9812a493bc52';

const httpContext = (params: unknown): ExecutionContext =>
  ({
    getType: () => 'http',
    switchToHttp: () => ({getRequest: () => ({params})}),
  }) as unknown as ExecutionContext;

describe('ProjectLogContextGuard', () => {
  let logContext: AsyncLocalStorageLogContextProvider;
  let guard: ProjectLogContextGuard;

  beforeEach(() => {
    logContext = new AsyncLocalStorageLogContextProvider();
    guard = new ProjectLogContextGuard(logContext);
  });

  /** Runs the guard inside a request context; returns the result and context. */
  const activate = (
    context: ExecutionContext,
  ): {allowed: boolean; after: ActiveLogContext} =>
    logContext.run({clientInstanceId: LAUNCH}, () => {
      const allowed = guard.canActivate(context);
      return {allowed, after: logContext.current()};
    });

  it('adds the route project ID and allows the request', () => {
    expect(activate(httpContext({projectId: '42', subgraphId: '7'}))).toEqual({
      allowed: true,
      after: {clientInstanceId: LAUNCH, projectId: '42'},
    });
  });

  it('keeps a project ID at the length limit', () => {
    const projectId = 'x'.repeat(MAX_LOGGED_PROJECT_ID_LENGTH);
    expect(activate(httpContext({projectId})).after.projectId).toBe(projectId);
  });

  it.each([
    ['a route without :projectId', {}],
    ['no params at all', undefined],
    ['an empty project ID', {projectId: ''}],
    ['a non-string project ID', {projectId: ['42']}],
    [
      'a project ID over the length limit',
      {projectId: 'x'.repeat(MAX_LOGGED_PROJECT_ID_LENGTH + 1)},
    ],
  ])('adds nothing for %s and still allows the request', (_l, params) => {
    expect(activate(httpContext(params))).toEqual({
      allowed: true,
      after: {clientInstanceId: LAUNCH},
    });
  });

  it('ignores non-HTTP contexts', () => {
    const rpc = {
      getType: () => 'rpc',
      switchToHttp: () => {
        throw new Error('not HTTP');
      },
    } as unknown as ExecutionContext;
    expect(activate(rpc)).toEqual({
      allowed: true,
      after: {clientInstanceId: LAUNCH},
    });
  });
});
