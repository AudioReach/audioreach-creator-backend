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
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {CommandHandlerNotFoundException} from '../exceptions/handler-not-found-exception.js';
import {UploadFileCommand} from '../../../file-operations/upload-file/upload-file.command.js';
import {UploadFileHandler} from '../../../file-operations/upload-file/upload-file.handler.js';
import type {FileSystemPort} from '../../../ports/file-system/file-system.port.js';
import type {WorkerPoolPort} from '../../../ports/worker/worker-pool.port.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';
import type {ProfilerPort} from '../../../ports/profiling/profiler.port.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {NaturalIdGenerationPort} from '../../../ports/id-generation/natural-id-generation.port.js';
import {UpdateValidationPreferencesCommand} from '../../../validation/commands/update-validation-preferences.command.js';
import {UpdateValidationPreferencesHandler} from '../../../validation/commands/update-validation-preferences.handler.js';
import {AcknowledgeDataLossCommand} from '../../../validation/commands/acknowledge-data-loss.command.js';
import {AcknowledgeDataLossHandler} from '../../../validation/commands/acknowledge-data-loss.handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import {StartSessionCommand} from '../../../edit-session/start-session/start-session.command.js';
import {StartSessionHandler} from '../../../edit-session/start-session/start-session.handler.js';
import {EndSessionCommand} from '../../../edit-session/end-session/end-session.command.js';
import {EndSessionHandler} from '../../../edit-session/end-session/end-session.handler.js';
import {PatchSpfModuleCommand} from '../../../usecase-designer/spf-module/patch/patch-spf-module.command.js';
import {PatchSpfModuleHandler} from '../../../usecase-designer/spf-module/patch/patch-spf-module.handler.js';
import {CreateModuleCommand} from '../../../usecase-designer/spf-module/create-module/create-module.command.js';
import {CreateModuleHandler} from '../../../usecase-designer/spf-module/create-module/create-module.handler.js';
import {UpdateSubgraphScenarioCommand} from '../../../usecase-designer/subgraph/update-scenario/update-subgraph-scenario.command.js';
import {UpdateSubgraphScenarioHandler} from '../../../usecase-designer/subgraph/update-scenario/update-subgraph-scenario.handler.js';
import {UpdateSubgraphVsidCommand} from '../../../usecase-designer/subgraph/update-vsid/update-subgraph-vsid.command.js';
import {UpdateSubgraphVsidHandler} from '../../../usecase-designer/subgraph/update-vsid/update-subgraph-vsid.handler.js';
import {PatchSubgraphCommand} from '../../../usecase-designer/subgraph/patch/patch-subgraph.command.js';
import {PatchSubgraphHandler} from '../../../usecase-designer/subgraph/patch/patch-subgraph.handler.js';
import {UpdateSubgraphPropertyCommand} from '../../../usecase-designer/subgraph/update-property/update-subgraph-property.command.js';
import {UpdateSubgraphPropertyHandler} from '../../../usecase-designer/subgraph/update-property/update-subgraph-property.handler.js';
import {UpdateSubgraphContainerIdCommand} from '../../../usecase-designer/subgraph/update-container-id/update-subgraph-container-id.command.js';
import {UpdateSubgraphContainerIdHandler} from '../../../usecase-designer/subgraph/update-container-id/update-subgraph-container-id.handler.js';
import {CreateVcpmCkvCommand} from '../../../usecase-designer/subgraph/create-vcpm-ckv/create-vcpm-ckv.command.js';
import {CreateVcpmCkvHandler} from '../../../usecase-designer/subgraph/create-vcpm-ckv/create-vcpm-ckv.handler.js';
import {DeleteVcpmCkvCommand} from '../../../usecase-designer/subgraph/delete-vcpm-ckv/delete-vcpm-ckv.command.js';
import {DeleteVcpmCkvHandler} from '../../../usecase-designer/subgraph/delete-vcpm-ckv/delete-vcpm-ckv.handler.js';
import {UpdateVcpmCalDataCommand} from '../../../usecase-designer/subgraph/update-vcpm-cal-data/update-vcpm-cal-data.command.js';
import {UpdateVcpmCalDataHandler} from '../../../usecase-designer/subgraph/update-vcpm-cal-data/update-vcpm-cal-data.handler.js';
import {UpdateContainerPropertyCommand} from '../../../usecase-designer/container/update-property/update-container-property.command.js';
import {UpdateContainerPropertyHandler} from '../../../usecase-designer/container/update-property/update-container-property.handler.js';
import {CreateDataLinkCommand} from '../../../usecase-designer/data-links/create/create-data-link.command.js';
import {CreateDataLinkHandler} from '../../../usecase-designer/data-links/create/create-data-link.handler.js';
import {DeleteDataLinkCommand} from '../../../usecase-designer/data-links/delete/delete-data-link.command.js';
import {DeleteDataLinkHandler} from '../../../usecase-designer/data-links/delete/delete-data-link.handler.js';
import {CreateControlLinkCommand} from '../../../usecase-designer/control-links/create/create-control-link.command.js';
import {CreateControlLinkHandler} from '../../../usecase-designer/control-links/create/create-control-link.handler.js';
import {DeleteControlLinkCommand} from '../../../usecase-designer/control-links/delete/delete-control-link.command.js';
import {DeleteControlLinkHandler} from '../../../usecase-designer/control-links/delete/delete-control-link.handler.js';
import {PutCkvCalDataCommand} from '../../../usecase-designer/spf-module/put-cal-data/put-ckv-cal-data.command.js';
import {PutCkvCalDataHandler} from '../../../usecase-designer/spf-module/put-cal-data/put-ckv-cal-data.handler.js';

export interface CommandHandlerDependencies {
  uow: UnitOfWork;
  idGeneration: IdGenerationPort;
  naturalIdGeneration: NaturalIdGenerationPort;
  fileSystem: FileSystemPort;
  queryServices: QueryServices;
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
    this.commandHandlerFactories.set(UploadFileCommand, {
      create: deps =>
        new UploadFileHandler(
          deps.uow,
          deps.fileSystem,
          deps.idGeneration,
          deps.naturalIdGeneration,
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

    this.commandHandlerFactories.set(CreateDataLinkCommand, {
      create: deps =>
        new CreateDataLinkHandler(
          deps.uow,
          deps.queryServices,
          deps.idGeneration,
        ),
    });

    this.commandHandlerFactories.set(CreateControlLinkCommand, {
      create: deps =>
        new CreateControlLinkHandler(
          deps.uow,
          deps.queryServices,
          deps.idGeneration,
        ),
    });

    this.commandHandlerFactories.set(DeleteDataLinkCommand, {
      create: deps => new DeleteDataLinkHandler(deps.uow),
    });

    this.commandHandlerFactories.set(DeleteControlLinkCommand, {
      create: deps => new DeleteControlLinkHandler(deps.uow),
    });

    this.commandHandlerFactories.set(StartSessionCommand, {
      create: deps => new StartSessionHandler(deps.uow),
    });

    this.commandHandlerFactories.set(EndSessionCommand, {
      create: deps => new EndSessionHandler(deps.uow),
    });

    this.commandHandlerFactories.set(PatchSpfModuleCommand, {
      create: deps => new PatchSpfModuleHandler(deps.uow, deps.idGeneration),
    });

    this.commandHandlerFactories.set(CreateModuleCommand, {
      create: deps =>
        new CreateModuleHandler(
          deps.uow,
          deps.idGeneration,
          deps.naturalIdGeneration,
        ),
    });

    this.commandHandlerFactories.set(UpdateSubgraphScenarioCommand, {
      create: deps =>
        new UpdateSubgraphScenarioHandler(deps.uow, deps.queryServices),
    });

    this.commandHandlerFactories.set(UpdateSubgraphVsidCommand, {
      create: deps =>
        new UpdateSubgraphVsidHandler(deps.uow, deps.queryServices),
    });

    this.commandHandlerFactories.set(PatchSubgraphCommand, {
      create: deps => new PatchSubgraphHandler(deps.uow),
    });

    this.commandHandlerFactories.set(UpdateSubgraphPropertyCommand, {
      create: deps =>
        new UpdateSubgraphPropertyHandler(deps.uow, deps.queryServices),
    });

    this.commandHandlerFactories.set(UpdateSubgraphContainerIdCommand, {
      create: deps => new UpdateSubgraphContainerIdHandler(deps.uow),
    });

    this.commandHandlerFactories.set(CreateVcpmCkvCommand, {
      create: deps => new CreateVcpmCkvHandler(deps.uow),
    });

    this.commandHandlerFactories.set(DeleteVcpmCkvCommand, {
      create: deps => new DeleteVcpmCkvHandler(deps.uow),
    });

    this.commandHandlerFactories.set(UpdateVcpmCalDataCommand, {
      create: deps => new UpdateVcpmCalDataHandler(deps.uow),
    });

    this.commandHandlerFactories.set(UpdateContainerPropertyCommand, {
      create: deps => new UpdateContainerPropertyHandler(deps.uow),
    });

    this.commandHandlerFactories.set(PutCkvCalDataCommand, {
      create: deps => new PutCkvCalDataHandler(deps.uow, deps.logger),
    });
  }
}
