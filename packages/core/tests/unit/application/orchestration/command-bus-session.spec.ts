/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {CommandBus} from '../../../../src/application/orchestration/command-bus.js';
import {BaseCommand} from '../../../../src/application/shared/base-command.js';
import {
  SessionRequiredError,
  SessionModeNotAllowedError,
} from '../../../../src/application/orchestration/cqrs/errors.js';
import {SESSION_MODE} from '../../../../src/application/shared/change-vocabulary.js';
import type {ActiveSession} from '../../../../src/application/orchestration/cqrs/active-session.js';
import type {UnitOfWork} from '../../../../src/application/ports/persistence/unit-of-work.js';
import type {WriteContext} from '../../../../src/application/orchestration/cqrs/write-context.js';

// ── Minimal test doubles ────────────────────────────────────────────────────

function makeMockUow(): UnitOfWork & {capturedCtx: WriteContext | undefined} {
  let capturedCtx: WriteContext | undefined;
  return {
    startTransaction: async () => undefined,
    commit: async () => undefined,
    rollback: async () => undefined,
    isInTransaction: () => false,
    getBulkImportRepository: () => ({}) as any,
    getProjectRepository: () => ({}) as any,
    getValidationPreferencesRepository: () => ({}) as any,
    getValidationQueryService: () => ({}) as any,
    setWriteContext: (ctx: WriteContext) => {
      capturedCtx = ctx;
    },
    getWriteContext: () => capturedCtx as WriteContext,
    applyCachedActions: async () => undefined,
    getSessionRepository: () => ({}) as any,
    get capturedCtx() {
      return capturedCtx;
    },
  };
}

function makeCommandBus(
  uow: UnitOfWork,
  handlerResult: unknown = undefined,
): CommandBus {
  const mockHandler = {handle: jest.fn().mockResolvedValue(handlerResult)};
  const mockRegistry = {
    getCommandHandlerFactory: jest.fn().mockReturnValue({
      create: jest.fn().mockReturnValue(mockHandler),
    }),
  };
  const mockUowFactory = jest.fn().mockResolvedValue({
    uow,
    release: jest.fn().mockResolvedValue(undefined),
  });

  return new CommandBus(
    mockRegistry as any,
    {} as any,
    {} as any,
    {} as any,
    mockUowFactory,
    {} as any,
  );
}

// ── Command fixtures ────────────────────────────────────────────────────────

class RequiresSessionAnyModeCommand extends BaseCommand {
  // Inherits requiresSession = true, allowedModes = []
  constructor() {
    super('client-1');
  }
}

class DesignerOnlyCommand extends BaseCommand {
  static override readonly requiresSession = true;
  static override readonly allowedModes = [SESSION_MODE.Designer] as const;
  constructor() {
    super('client-2');
  }
}

class MultiModeCommand extends BaseCommand {
  static override readonly requiresSession = true;
  static override readonly allowedModes = [
    SESSION_MODE.Designer,
    SESSION_MODE.DiffMerge,
  ] as const;
  constructor() {
    super('client-3');
  }
}

class SessionFreeCommand extends BaseCommand {
  static override readonly requiresSession = false;
  static override readonly allowedModes = [] as const;
  constructor() {
    super('client-4');
  }
}

// ── Session fixtures ────────────────────────────────────────────────────────

const designerSession: ActiveSession = {
  sessionId: 10,
  mode: SESSION_MODE.Designer,
  fileSystemId: 1,
  projectId: 'proj-1',
};
const tuningSession: ActiveSession = {
  sessionId: 11,
  mode: SESSION_MODE.Tuning,
  fileSystemId: 1,
  projectId: 'proj-1',
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe('CommandBus — session/mode enforcement', () => {
  describe('SessionRequiredError', () => {
    it('throws when requiresSession=true and no session is passed', async () => {
      const bus = makeCommandBus(makeMockUow());
      await expect(
        bus.execute(new RequiresSessionAnyModeCommand()),
      ).rejects.toThrow(SessionRequiredError);
    });

    it('throws with the correct commandName', async () => {
      const bus = makeCommandBus(makeMockUow());
      await expect(
        bus.execute(new RequiresSessionAnyModeCommand()),
      ).rejects.toMatchObject({
        commandName: 'RequiresSessionAnyModeCommand',
      });
    });

    it('does NOT throw when requiresSession=false and no session is passed', async () => {
      const bus = makeCommandBus(makeMockUow());
      await expect(
        bus.execute(new SessionFreeCommand()),
      ).resolves.toBeUndefined();
    });
  });

  describe('SessionModeNotAllowedError', () => {
    it('throws when session mode is not in allowedModes', async () => {
      const bus = makeCommandBus(makeMockUow());
      await expect(
        bus.execute(new DesignerOnlyCommand(), tuningSession),
      ).rejects.toThrow(SessionModeNotAllowedError);
    });

    it('throws with correct commandName, currentMode, and allowedModes', async () => {
      const bus = makeCommandBus(makeMockUow());
      await expect(
        bus.execute(new DesignerOnlyCommand(), tuningSession),
      ).rejects.toMatchObject({
        commandName: 'DesignerOnlyCommand',
        currentMode: SESSION_MODE.Tuning,
        allowedModes: [SESSION_MODE.Designer],
      });
    });

    it('does NOT throw when session mode is in allowedModes', async () => {
      const bus = makeCommandBus(makeMockUow());
      await expect(
        bus.execute(new DesignerOnlyCommand(), designerSession),
      ).resolves.toBeUndefined();
    });

    it('does NOT throw when allowedModes is empty (any mode accepted)', async () => {
      const bus = makeCommandBus(makeMockUow());
      await expect(
        bus.execute(new RequiresSessionAnyModeCommand(), tuningSession),
      ).resolves.toBeUndefined();
    });

    it('accepts any mode in a multi-mode allowlist', async () => {
      const bus = makeCommandBus(makeMockUow());
      const diffMergeSession: ActiveSession = {
        sessionId: 12,
        mode: SESSION_MODE.DiffMerge,
        fileSystemId: 1,
        projectId: 'proj-1',
      };
      await expect(
        bus.execute(new MultiModeCommand(), diffMergeSession),
      ).resolves.toBeUndefined();
    });
  });

  describe('WriteContext stamping', () => {
    it('stamps WriteContext when a session is present', async () => {
      const uow = makeMockUow();
      const bus = makeCommandBus(uow);
      await bus.execute(new DesignerOnlyCommand(), designerSession);
      expect(uow.capturedCtx).toBeDefined();
      expect(uow.capturedCtx!.session).toEqual(designerSession);
    });

    it('WriteContext.groupId is a non-empty string (UUID)', async () => {
      const uow = makeMockUow();
      const bus = makeCommandBus(uow);
      await bus.execute(new DesignerOnlyCommand(), designerSession);
      expect(typeof uow.capturedCtx!.groupId).toBe('string');
      expect(uow.capturedCtx!.groupId.length).toBeGreaterThan(0);
    });

    it('each execute() call produces a different groupId', async () => {
      const uow1 = makeMockUow();
      const uow2 = makeMockUow();
      await makeCommandBus(uow1).execute(
        new DesignerOnlyCommand(),
        designerSession,
      );
      await makeCommandBus(uow2).execute(
        new DesignerOnlyCommand(),
        designerSession,
      );
      expect(uow1.capturedCtx!.groupId).not.toBe(uow2.capturedCtx!.groupId);
    });

    it('does NOT stamp WriteContext for Case-3 commands (no session)', async () => {
      const uow = makeMockUow();
      const bus = makeCommandBus(uow);
      await bus.execute(new SessionFreeCommand());
      expect(uow.capturedCtx).toBeUndefined();
    });

    it('handler is NOT invoked when session check rejects (mode not allowed)', async () => {
      const uow = makeMockUow();
      const mockHandler = {handle: jest.fn()};
      const mockRegistry = {
        getCommandHandlerFactory: jest
          .fn()
          .mockReturnValue({create: jest.fn().mockReturnValue(mockHandler)}),
      };
      const mockUowFactory = jest.fn().mockResolvedValue({
        uow,
        release: jest.fn().mockResolvedValue(undefined),
      });
      const bus = new CommandBus(
        mockRegistry as any,
        {} as any,
        {} as any,
        {} as any,
        mockUowFactory,
        {} as any,
      );

      await expect(
        bus.execute(new DesignerOnlyCommand(), tuningSession),
      ).rejects.toThrow(SessionModeNotAllowedError);
      expect(mockHandler.handle).not.toHaveBeenCalled();
    });

    it('handler is NOT invoked when session required but absent (SessionRequiredError)', async () => {
      const uow = makeMockUow();
      const mockHandler = {handle: jest.fn()};
      const mockRegistry = {
        getCommandHandlerFactory: jest
          .fn()
          .mockReturnValue({create: jest.fn().mockReturnValue(mockHandler)}),
      };
      const mockUowFactory = jest.fn().mockResolvedValue({
        uow,
        release: jest.fn().mockResolvedValue(undefined),
      });
      const bus = new CommandBus(
        mockRegistry as any,
        {} as any,
        {} as any,
        {} as any,
        mockUowFactory,
        {} as any,
      );

      await expect(
        bus.execute(new RequiresSessionAnyModeCommand()),
      ).rejects.toThrow(SessionRequiredError);
      expect(mockHandler.handle).not.toHaveBeenCalled();
    });
  });
});
