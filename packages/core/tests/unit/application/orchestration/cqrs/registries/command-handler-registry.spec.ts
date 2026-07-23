/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CommandHandlerRegistry} from '../../../../../../src/application/orchestration/cqrs/registries/command-handler-registry.js';
import {CommandHandlerNotFoundException} from '../../../../../../src/application/orchestration/cqrs/exceptions/handler-not-found-exception.js';
import {StartSessionCommand} from '../../../../../../src/application/edit-session/start-session/start-session.command.js';
import {EndSessionCommand} from '../../../../../../src/application/edit-session/end-session/end-session.command.js';
import {SESSION_MODE} from '../../../../../../src/application/shared/change-vocabulary.js';
import {UnknownCommand} from '../../helpers/test-commands.js';
import {createMockUnitOfWork} from '../../helpers/mock-factories.js';
import type {UnitOfWork} from '../../../../../../src/application/ports/persistence/unit-of-work.js';

function buildMinimalDeps(uow: UnitOfWork) {
  return {
    uow,
    idGeneration: {} as any,
    naturalIdGeneration: {} as any,
    fileSystem: {} as any,
    queryServices: {} as any,
  };
}

describe('CommandHandlerRegistry', () => {
  const registry = CommandHandlerRegistry.Instance;

  describe('Singleton Behavior', () => {
    it('returns the same instance across calls', () => {
      expect(CommandHandlerRegistry.Instance).toBe(
        CommandHandlerRegistry.Instance,
      );
    });
  });

  describe('Session handler registrations', () => {
    it('the StartSessionCommand factory creates a handler', () => {
      const cmd = new StartSessionCommand('proj-1', SESSION_MODE.Designer);
      const handler = registry
        .getCommandHandlerFactory(cmd)
        .create(buildMinimalDeps(createMockUnitOfWork()));
      expect(typeof handler.handle).toBe('function');
    });

    it('the EndSessionCommand factory creates a handler', () => {
      const cmd = new EndSessionCommand('proj-1');
      const handler = registry
        .getCommandHandlerFactory(cmd)
        .create(buildMinimalDeps(createMockUnitOfWork()));
      expect(typeof handler.handle).toBe('function');
    });

    it('creates a new handler instance on each factory.create() call', () => {
      const cmd = new StartSessionCommand('proj-1', SESSION_MODE.Designer);
      const factory = registry.getCommandHandlerFactory(cmd);
      const deps = buildMinimalDeps(createMockUnitOfWork());
      expect(factory.create(deps)).not.toBe(factory.create(deps));
    });
  });

  describe('Error handling', () => {
    it('throws CommandHandlerNotFoundException for an unregistered command', () => {
      expect(() =>
        registry.getCommandHandlerFactory(new UnknownCommand()),
      ).toThrow(CommandHandlerNotFoundException);
    });

    it('exception message contains the command name', () => {
      expect(() =>
        registry.getCommandHandlerFactory(new UnknownCommand()),
      ).toThrow('UnknownCommand');
    });

    it('throws for null/undefined input', () => {
      expect(() => registry.getCommandHandlerFactory(null as any)).toThrow();
      expect(() =>
        registry.getCommandHandlerFactory(undefined as any),
      ).toThrow();
    });
  });
});
