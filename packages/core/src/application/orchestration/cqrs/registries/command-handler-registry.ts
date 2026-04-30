/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Manual Handler Registry for Cross-Platform Compatibility
 *
 * This registry uses explicit manual registration instead of reflection-based
 * automatic discovery to ensure compatibility across all JavaScript environments.
 *
 * WHY MANUAL REGISTRATION:
 *
 * 1. **React Native Compatibility**
 *    - React Native has limited support for reflect-metadata
 *    - Metro bundler doesn't handle reflection metadata reliably
 *    - Manual registration works consistently across all RN versions
 *
 * 2. **TC39 Reflection API Evolution**
 *    - Current reflect-metadata is a polyfill, not a standard
 *    - TC39 is developing new native reflection APIs that may change
 *    - Manual approach avoids dependency on evolving reflection standards
 *
 * 3. **Cross-Platform Reliability**
 *    - Works identically in Node.js, browsers, React Native, and Electron
 *    - No runtime environment-specific polyfills or configurations required
 *    - Consistent behavior across development, testing, and production environments
 *
 * 4. **Zero External Dependencies**
 *    - No need for reflect-metadata package or decorator transforms
 *    - Reduces bundle size and eliminates potential compatibility issues
 *    - Simplifies build configuration across different platforms
 *
 * 5. **Predictable Performance**
 *    - No reflection overhead during handler discovery or instantiation
 *    - Deterministic startup time without metadata scanning
 *    - Optimal performance in resource-constrained environments (mobile)
 *
 * MANUAL REGISTRATION BENEFITS:
 *
 * - **Explicit Control**: Every handler registration is visible and intentional
 * - **Type Safety**: Full TypeScript support without decorator metadata
 * - **Debugging**: Clear stack traces and error messages
 * - **Testing**: Easy to mock and test individual handler registrations
 *
 * This approach prioritizes reliability and cross-platform compatibility over
 * automatic convenience, ensuring the CQRS system works consistently across
 * all target environments including React Native mobile applications.
 */

import type {Command} from '../commands/command.js';
import type {CommandHandler} from '../commands/command-handler.js';
import {AddModuleCommandHandler} from '../../../usecase-designer/spf-module/create/create-module.handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {CommandHandlerNotFoundException} from '../exceptions/handler-not-found-exception.js';
import {AddModuleCommand} from '../../../usecase-designer/index.js';
import {UploadFileCommand} from '../../../file-operations/upload-file/upload-file.command.js';
import {UploadFileHandler} from '../../../file-operations/upload-file/upload-file.handler.js';
import type {FileReaderPort} from '../../../ports/file-system/file-reader.port.js';
import type {WorkerPoolPort} from '../../../ports/worker/worker-pool.port.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';
import type {ProfilerPort} from '../../../ports/profiling/profiler.port.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import {UpdateValidationPreferencesCommand} from '../../../validation/commands/update-validation-preferences.command.js';
import {UpdateValidationPreferencesHandler} from '../../../validation/commands/update-validation-preferences.handler.js';
import {AcknowledgeDataLossCommand} from '../../../validation/commands/acknowledge-data-loss.command.js';
import {AcknowledgeDataLossHandler} from '../../../validation/commands/acknowledge-data-loss.handler.js';

export interface CommandHandlerDependencies {
  uow: UnitOfWork;
  idGeneration: IdGenerationPort;
  fileReader: FileReaderPort;
  workerPool?: WorkerPoolPort;
  logger?: Logger;
  profiler?: ProfilerPort;
  // Event Bus
}

export interface CommandHandlerFactory<THandler> {
  create(dependencies: CommandHandlerDependencies): THandler;
}

type CommandConstructor<T extends Command = Command> = new (
  ...arguments_: any[]
) => T;

export class CommandHandlerRegistry {
  private static instance: CommandHandlerRegistry;

  // This is map holding command constructor function as key and its handler as value
  private commandHandlerFactories: Map<
    CommandConstructor,
    CommandHandlerFactory<CommandHandler<any, any>>
  > = new Map();

  public static get Instance(): CommandHandlerRegistry {
    if (!this.instance) {
      this.instance = new CommandHandlerRegistry();
    }
    return this.instance;
  }

  private constructor() {
    this.registerAllCommandHandlers();
  }

  public getCommandHandlerFactory(
    command: Command,
  ): CommandHandlerFactory<CommandHandler<any, any>> {
    const commandType = command.constructor as CommandConstructor<Command>;
    const handlerFactory = this.commandHandlerFactories.get(commandType);
    if (!handlerFactory) {
      throw new CommandHandlerNotFoundException(commandType.name);
    }
    return handlerFactory;
  }

  private registerAllCommandHandlers(): void {
    // To Do: Have separate registration files for each feature and register them here
    this.commandHandlerFactories.set(AddModuleCommand, {
      create: deps => new AddModuleCommandHandler(deps.uow),
    });
    this.commandHandlerFactories.set(UploadFileCommand, {
      create: deps =>
        new UploadFileHandler(
          deps.uow,
          deps.fileReader,
          deps.idGeneration,
          deps.workerPool,
          deps.logger,
          deps.profiler,
        ),
    });

    this.commandHandlerFactories.set(UpdateValidationPreferencesCommand, {
      create: deps => new UpdateValidationPreferencesHandler(deps.uow),
    });

    this.commandHandlerFactories.set(AcknowledgeDataLossCommand, {
      create: deps => new AcknowledgeDataLossHandler(deps.uow),
    });
  }
}
