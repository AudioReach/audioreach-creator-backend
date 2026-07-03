/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Command} from './cqrs/commands/command.js';
import {CommandHandlerRegistry} from './cqrs/registries/command-handler-registry.js';
import type {CommandHandlerDependencies} from './cqrs/registries/command-handler-registry.js';
import type {FileSystemPort} from '../ports/file-system/file-system.port.js';
import type {WorkerPoolPort} from '../ports/worker/worker-pool.port.js';
import type {Logger} from '../../shared/types/logger.interface.js';
import type {ProfilerPort} from '../ports/profiling/profiler.port.js';
import type {UnitOfWorkFactory} from '../ports/persistence/unit-of-work-factory.js';
import type {UnitOfWork} from '../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../ports/id-generation/id-generation.port.js';
import type {NaturalIdGenerationPort} from '../ports/id-generation/natural-id-generation.port.js';
import type {QueryServices} from '../ports/persistence/query-services/query-services.js';

export class CommandBus {
  constructor(
    private readonly handlerRegistry: CommandHandlerRegistry,
    private readonly idGeneration: IdGenerationPort,
    private readonly naturalIdGeneration: NaturalIdGenerationPort,
    private readonly fileSystem: FileSystemPort,
    private readonly uowFactory: UnitOfWorkFactory,
    private readonly queryServices: QueryServices,
    private readonly workerPool?: WorkerPoolPort,
    private readonly logger?: Logger,
    private readonly profiler?: ProfilerPort,
  ) {}

  async execute<TResponse = void>(command: Command): Promise<TResponse> {
    const {uow, release} = await this.uowFactory();

    this.logger?.logDebug({
      msg: 'UnitOfWork created for command execution',
      action: 'uow-created',
      component: 'CommandBus',
      tag: 'uow-lifecycle',
      timestamp: new Date(),
    });

    try {
      const handler = this.createHandler(command, uow);

      // Call command handler to perform the operation
      const result = await handler.handle(command);

      // Safety check: ensure transaction is closed
      if (uow.isInTransaction()) {
        this.logger?.logWarn({
          msg: `Handler ${command.constructor.name} left transaction open. Auto-rolling back.`,
          action: 'auto-rollback',
          component: 'CommandBus',
          tag: 'transaction-safety',
          timestamp: new Date(),
        });
        await uow.rollback();
      }

      this.logger?.logDebug({
        msg: `Command executed successfully: ${command.constructor.name}`,
        action: 'command-execution-success',
        component: 'CommandBus',
        tag: 'command-execution',
        timestamp: new Date(),
      });

      return result;
    } catch (error) {
      this.logger?.logError({
        msg: `Command execution failed: ${command.constructor.name}`,
        action: 'command-execution-error',
        component: 'CommandBus',
        tag: 'command-execution',
        timestamp: new Date(),
        error: error instanceof Error ? error : new Error(String(error)),
      });

      // Attempt to rollback if transaction is active
      try {
        if (uow.isInTransaction()) {
          await uow.rollback();
          this.logger?.logDebug({
            msg: 'Transaction rolled back due to error',
            action: 'error-rollback',
            component: 'CommandBus',
            tag: 'transaction-rollback',
            timestamp: new Date(),
          });
        }
      } catch (rollbackError) {
        this.logger?.logError({
          msg: 'Failed to rollback transaction after error',
          action: 'rollback-error',
          component: 'CommandBus',
          tag: 'transaction-rollback',
          timestamp: new Date(),
          error:
            rollbackError instanceof Error
              ? rollbackError
              : new Error(String(rollbackError)),
        });
      }

      throw error;
    } finally {
      await release();
    }
  }

  private createHandler(command: Command, uow: UnitOfWork): any {
    const factory = this.handlerRegistry.getCommandHandlerFactory(command);
    const dependencies: CommandHandlerDependencies = {
      uow,
      idGeneration: this.idGeneration,
      naturalIdGeneration: this.naturalIdGeneration,
      fileSystem: this.fileSystem,
      queryServices: this.queryServices,
      workerPool: this.workerPool,
      logger: this.logger,
      profiler: this.profiler,
    };
    return factory.create(dependencies);
  }
}
