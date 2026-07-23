/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {EndSessionHandler} from '../../../../../src/application/edit-session/end-session/end-session.handler.js';
import {EndSessionCommand} from '../../../../../src/application/edit-session/end-session/end-session.command.js';
import {SESSION_MODE} from '../../../../../src/application/shared/change-vocabulary.js';
import {RESULT_KIND} from '../../../../../src/application/shared/result/result.js';
import type {UnitOfWork} from '../../../../../src/application/ports/persistence/unit-of-work.js';
import type {ISessionRepository} from '../../../../../src/application/ports/persistence/repositories/session/session.repository.js';

const PROJECT_ID = 'proj-abc-123';
const SESSION_ID = 7;
const FILE_SYSTEM_ID = 42;

const ACTIVE_SESSION = {
  sessionId: SESSION_ID,
  mode: SESSION_MODE.Designer,
  fileSystemId: FILE_SYSTEM_ID,
  projectId: PROJECT_ID,
};

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
  session = ACTIVE_SESSION,
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
    getWriteContext: jest.fn().mockReturnValue({session, groupId: 'grp-001'}),
    applyCachedActions: jest.fn(),
  } as unknown as jest.Mocked<UnitOfWork>;
}

describe('EndSessionHandler', () => {
  it('wipes, deletes session, and returns ok when no commits exist', async () => {
    const sessionRepo = buildMockSessionRepo();
    sessionRepo.wipeUnstagedForSession.mockResolvedValue(3);
    sessionRepo.countCommitsForSession.mockResolvedValue(0);
    sessionRepo.deleteSession.mockResolvedValue(undefined);

    const uow = buildMockUow(sessionRepo);
    const result = await new EndSessionHandler(uow).handle(
      new EndSessionCommand(PROJECT_ID),
    );

    expect(sessionRepo.wipeUnstagedForSession).toHaveBeenCalledWith(SESSION_ID);
    expect(sessionRepo.deleteSession).toHaveBeenCalledWith(SESSION_ID);
    expect(sessionRepo.markSessionEnded).not.toHaveBeenCalled();
    expect(uow.commit).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind === RESULT_KIND.Ok) {
      expect(result.data.summary).toContain('no commits');
      expect(result.data.summary).toContain('3');
      expect(result.data.summary).toContain('removed');
    }
  });

  it('wipes, marks ended, and returns ok when commits exist', async () => {
    const sessionRepo = buildMockSessionRepo();
    sessionRepo.wipeUnstagedForSession.mockResolvedValue(2);
    sessionRepo.countCommitsForSession.mockResolvedValue(4);
    sessionRepo.markSessionEnded.mockResolvedValue(undefined);

    const uow = buildMockUow(sessionRepo);
    const result = await new EndSessionHandler(uow).handle(
      new EndSessionCommand(PROJECT_ID),
    );

    expect(sessionRepo.deleteSession).not.toHaveBeenCalled();
    expect(sessionRepo.markSessionEnded).toHaveBeenCalledWith(SESSION_ID);
    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind === RESULT_KIND.Ok) {
      expect(result.data.summary).toContain('4');
      expect(result.data.summary).toContain('2');
      expect(result.data.summary).toContain('retained');
    }
  });

  it('rolls back and re-throws when wipeUnstagedForSession rejects', async () => {
    const sessionRepo = buildMockSessionRepo();
    sessionRepo.wipeUnstagedForSession.mockRejectedValue(
      new Error('DB wipe failed'),
    );

    const uow = buildMockUow(sessionRepo);
    await expect(
      new EndSessionHandler(uow).handle(new EndSessionCommand(PROJECT_ID)),
    ).rejects.toThrow('DB wipe failed');
    expect(uow.rollback).toHaveBeenCalledTimes(1);
    expect(uow.commit).not.toHaveBeenCalled();
  });

  it('rolls back and re-throws when markSessionEnded rejects', async () => {
    const sessionRepo = buildMockSessionRepo();
    sessionRepo.wipeUnstagedForSession.mockResolvedValue(0);
    sessionRepo.countCommitsForSession.mockResolvedValue(2);
    sessionRepo.markSessionEnded.mockRejectedValue(
      new Error('DB update failed'),
    );

    const uow = buildMockUow(sessionRepo);
    await expect(
      new EndSessionHandler(uow).handle(new EndSessionCommand(PROJECT_ID)),
    ).rejects.toThrow('DB update failed');
    expect(uow.rollback).toHaveBeenCalledTimes(1);
  });
});
