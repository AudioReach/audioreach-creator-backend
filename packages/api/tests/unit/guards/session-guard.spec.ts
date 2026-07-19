/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {ForbiddenException} from '@nestjs/common';
import type {ExecutionContext} from '@nestjs/common';
import {SessionGuard} from '../../../src/guards/session-guard.js';
import type {ISessionRepository, ActiveSession} from '@arc/core';
import {SESSION_MODE} from '@arc/core';

function makeContext(projectId: string): ExecutionContext {
  const req: Record<string, unknown> = {params: {projectId}};
  return {
    switchToHttp: () => ({getRequest: () => req}),
  } as unknown as ExecutionContext;
}

describe('SessionGuard', () => {
  const mockSession: ActiveSession = {
    sessionId: 1,
    mode: SESSION_MODE.Designer,
    fileSystemId: 10,
    projectId: 'proj-abc',
  };

  let sessionRepo: jest.Mocked<ISessionRepository>;
  let guard: SessionGuard;

  beforeEach(() => {
    sessionRepo = {
      findActiveSessionByProjectId: jest.fn(),
    } as unknown as jest.Mocked<ISessionRepository>;
    guard = new SessionGuard(sessionRepo);
  });

  it('attaches arcSession to request and returns true when a session is found', async () => {
    sessionRepo.findActiveSessionByProjectId.mockResolvedValue(mockSession);
    const ctx = makeContext('proj-abc');
    const req = ctx.switchToHttp().getRequest<Record<string, unknown>>();

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(req['arcSession']).toEqual(mockSession);
    expect(sessionRepo.findActiveSessionByProjectId).toHaveBeenCalledWith(
      'proj-abc',
    );
  });

  it('throws ForbiddenException with SESSION_NOT_OPEN errorCode when no active session exists', async () => {
    sessionRepo.findActiveSessionByProjectId.mockResolvedValue(null);
    const ctx = makeContext('proj-xyz');

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      'No active session for project proj-xyz',
    );
    const error = await guard
      .canActivate(ctx)
      .catch(e => e as ForbiddenException);
    expect((error.getResponse() as Record<string, unknown>).errorCode).toBe(
      'SESSION_NOT_OPEN',
    );
  });

  it('does not modify the request when throwing ForbiddenException', async () => {
    sessionRepo.findActiveSessionByProjectId.mockResolvedValue(null);
    const ctx = makeContext('proj-xyz');
    const req = ctx.switchToHttp().getRequest<Record<string, unknown>>();

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(req['arcSession']).toBeUndefined();
  });
});
