/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {StartSessionHandler} from '../../../../../src/application/edit-session/start-session/start-session.handler.js';
import {StartSessionCommand} from '../../../../../src/application/edit-session/start-session/start-session.command.js';
import {SESSION_MODE} from '../../../../../src/application/shared/change-vocabulary.js';
import {RESULT_KIND} from '../../../../../src/application/shared/result/result.js';
import {ResourceNotFoundException} from '../../../../../src/shared/exceptions/resource-not-found.exception.js';
import {InvalidOperationException} from '../../../../../src/shared/exceptions/invalid-operation.exception.js';
import type {UnitOfWork} from '../../../../../src/application/ports/persistence/unit-of-work.js';
import type {ISessionRepository} from '../../../../../src/application/ports/persistence/repositories/session/session.repository.js';

const PROJECT_ID = 'proj-abc-123';
const FILE_SYSTEM_ID = 42;
const SESSION_ID = 7;

function buildMockSessionRepo(): jest.Mocked<ISessionRepository> {
  return {
    findFileSystemIdByProjectId: jest.fn(),
    findActiveSessionByFileSystemId: jest.fn(),
    findActiveSessionByProjectId: jest.fn(),
    createSession: jest.fn(),
    countCommitsForSession: jest.fn(),
    deleteSession: jest.fn(),
    markSessionEnded: jest.fn(),
    wipeUnstagedForSession: jest.fn(),
  } as jest.Mocked<ISessionRepository>;
}

function buildMockUow(
  sessionRepo: jest.Mocked<ISessionRepository>,
): jest.Mocked<UnitOfWork> {
  return {
    startTransaction: jest
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined),
    commit: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    rollback: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    isInTransaction: jest.fn<() => boolean>().mockReturnValue(true),
    getBulkImportRepository: jest.fn(),
    getProjectRepository: jest.fn(),
    getValidationPreferencesRepository: jest.fn(),
    getValidationQueryService: jest.fn(),
    getSessionRepository: jest
      .fn<() => ISessionRepository>()
      .mockReturnValue(sessionRepo),
    setWriteContext: jest.fn(),
    getWriteContext: jest.fn(),
    applyCachedActions: jest.fn(),
  } as unknown as jest.Mocked<UnitOfWork>;
}

describe('StartSessionHandler', () => {
  it('creates a session and returns Result.ok when no active session exists', async () => {
    const sessionRepo = buildMockSessionRepo();
    sessionRepo.findFileSystemIdByProjectId.mockResolvedValue(FILE_SYSTEM_ID);
    sessionRepo.findActiveSessionByFileSystemId.mockResolvedValue(null);
    sessionRepo.createSession.mockResolvedValue(SESSION_ID);

    const handler = new StartSessionHandler(buildMockUow(sessionRepo));
    const result = await handler.handle(
      new StartSessionCommand(PROJECT_ID, SESSION_MODE.Designer),
    );

    expect(sessionRepo.createSession).toHaveBeenCalledWith({
      fileSystemId: FILE_SYSTEM_ID,
      sessionMode: SESSION_MODE.Designer,
      userId: null,
    });
    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind === RESULT_KIND.Ok) {
      expect(result.data.sessionId).toBe(SESSION_ID);
      expect(result.data.projectId).toBe(PROJECT_ID);
      expect(result.data.summary).toBe('Session started.');
    }
  });

  it('passes userId to createSession when provided', async () => {
    const sessionRepo = buildMockSessionRepo();
    sessionRepo.findFileSystemIdByProjectId.mockResolvedValue(FILE_SYSTEM_ID);
    sessionRepo.findActiveSessionByFileSystemId.mockResolvedValue(null);
    sessionRepo.createSession.mockResolvedValue(SESSION_ID);

    await new StartSessionHandler(buildMockUow(sessionRepo)).handle(
      new StartSessionCommand(PROJECT_ID, SESSION_MODE.Tuning, 'user-99'),
    );

    expect(sessionRepo.createSession).toHaveBeenCalledWith(
      expect.objectContaining({userId: 'user-99'}),
    );
  });

  it('rolls back and throws ResourceNotFoundException when projectId is not found', async () => {
    const sessionRepo = buildMockSessionRepo();
    sessionRepo.findFileSystemIdByProjectId.mockResolvedValue(null);
    const uow = buildMockUow(sessionRepo);

    await expect(
      new StartSessionHandler(uow).handle(
        new StartSessionCommand('unknown-proj', SESSION_MODE.Designer),
      ),
    ).rejects.toThrow(ResourceNotFoundException);

    expect(uow.rollback).toHaveBeenCalledTimes(1);
    expect(uow.commit).not.toHaveBeenCalled();
  });

  it('rolls back and throws InvalidOperationException when an active session already exists', async () => {
    const sessionRepo = buildMockSessionRepo();
    sessionRepo.findFileSystemIdByProjectId.mockResolvedValue(FILE_SYSTEM_ID);
    sessionRepo.findActiveSessionByFileSystemId.mockResolvedValue({
      sessionId: 5,
      mode: SESSION_MODE.Tuning,
      fileSystemId: FILE_SYSTEM_ID,
      projectId: PROJECT_ID,
    });
    const uow = buildMockUow(sessionRepo);

    await expect(
      new StartSessionHandler(uow).handle(
        new StartSessionCommand(PROJECT_ID, SESSION_MODE.Designer),
      ),
    ).rejects.toThrow(InvalidOperationException);

    expect(uow.rollback).toHaveBeenCalledTimes(1);
    expect(uow.commit).not.toHaveBeenCalled();
  });

  it('rolls back and re-throws when createSession rejects with a DB error', async () => {
    const sessionRepo = buildMockSessionRepo();
    sessionRepo.findFileSystemIdByProjectId.mockResolvedValue(FILE_SYSTEM_ID);
    sessionRepo.findActiveSessionByFileSystemId.mockResolvedValue(null);
    sessionRepo.createSession.mockRejectedValue(new Error('DB error'));
    const uow = buildMockUow(sessionRepo);

    await expect(
      new StartSessionHandler(uow).handle(
        new StartSessionCommand(PROJECT_ID, SESSION_MODE.Designer),
      ),
    ).rejects.toThrow('DB error');

    expect(uow.rollback).toHaveBeenCalledTimes(1);
  });
});
