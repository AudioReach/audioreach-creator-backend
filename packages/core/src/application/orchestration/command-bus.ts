/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../shared/base-command.js';
import {
  SessionRequiredError,
  SessionModeNotAllowedError,
} from './cqrs/errors.js';
import type {ActiveSession} from './cqrs/active-session.js';
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
import {generateUuid} from '../../shared/utilities/uuid.js';

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

  /**
   * Execute a command, optionally with an active session.
   *
   * Before invoking the handler, enforces (§7a.3 of foundation.md):
   *   1. Session requirement: throws SessionRequiredError when requiresSession = true
   *      but no session is provided.
   *   2. Mode gate: throws SessionModeNotAllowedError when allowedModes is non-empty
   *      and the session's mode is not in the list.
   *   3. WriteContext stamping: calls uow.setWriteContext({ session, groupId }) when
   *      a session is present. Skipped for Case-3 commands (requiresSession = false).
   *
   * Transaction lifecycle stays with handlers — CommandBus does NOT call
   * startTransaction, commit, or rollback (§7a.4 of foundation.md).
   */
  async execute<TResponse = void>(
    command: BaseCommand,
    session?: ActiveSession,
  ): Promise<TResponse> {
    this.enforceSessionPolicy(command, session);

    // ── UoW creation and WriteContext stamping ────────────────────────────
    const {uow, release} = await this.uowFactory();

    this.logger?.logDebug({
      msg: 'uow-created',
      description: 'UnitOfWork created for command execution',
      component: 'CommandBus',
      tag: 'uow-lifecycle',
    });

    // Stamp WriteContext only when a session is present (Case 1 + 2).
    if (session) {
      uow.setWriteContext({session, groupId: generateUuid()});
    }

    try {
      const handler = this.createHandler(command, uow);
      const result = await handler.handle(command);

      // Safety check: ensure transaction is closed
      if (uow.isInTransaction()) {
        this.logger?.logWarn({
          msg: 'auto-rollback',
          description: `Handler ${command.constructor.name} left transaction open. Auto-rolling back.`,
          component: 'CommandBus',
          tag: 'transaction-safety',
        });
        await uow.rollback();
      }

      this.logger?.logDebug({
        msg: 'command-execution-success',
        description: `Command executed successfully: ${command.constructor.name}`,
        component: 'CommandBus',
        tag: 'command-execution',
      });

      return result;
    } catch (error) {
      this.logger?.logError({
        msg: 'command-execution-error',
        description: `Command execution failed: ${command.constructor.name}`,
        component: 'CommandBus',
        tag: 'command-execution',
        error: error instanceof Error ? error : new Error(String(error)),
      });

      // Attempt to rollback if transaction is active
      try {
        if (uow.isInTransaction()) {
          await uow.rollback();
          this.logger?.logDebug({
            msg: 'error-rollback',
            description: 'Transaction rolled back due to error',
            component: 'CommandBus',
            tag: 'transaction-rollback',
          });
        }
      } catch (rollbackError) {
        this.logger?.logError({
          msg: 'rollback-error',
          description: 'Failed to rollback transaction after error',
          component: 'CommandBus',
          tag: 'transaction-rollback',
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

  private enforceSessionPolicy(
    command: BaseCommand,
    session?: ActiveSession,
  ): void {
    const cmdBaseInfo = command.constructor as typeof BaseCommand;
    if (cmdBaseInfo.requiresSession && !session) {
      throw new SessionRequiredError(cmdBaseInfo.name);
    }
    if (
      session &&
      cmdBaseInfo.allowedModes.length > 0 &&
      !cmdBaseInfo.allowedModes.includes(session.mode)
    ) {
      throw new SessionModeNotAllowedError(
        cmdBaseInfo.name,
        session.mode,
        cmdBaseInfo.allowedModes,
      );
    }
  }

  private createHandler(command: BaseCommand, uow: UnitOfWork): any {
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
