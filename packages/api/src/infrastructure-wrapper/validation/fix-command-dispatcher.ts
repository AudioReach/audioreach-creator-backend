/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Injectable} from '@nestjs/common';
import {
  DeleteStaleManualUsecaseEditCommand,
  InvalidInputException,
  RemoveCkvsCommand,
  ResolveSameGkvCollisionCommand,
  type BaseCommand,
} from '@arc/core';

/**
 * Maps fix command type names (from FixOption.commandType) to factory functions
 * that construct the corresponding CQRS command from a payload object.
 *
 * This is the explicit opt-in registry for fix commands. The registry starts
 * empty — nothing is dispatchable until a developer adds it to registerAll().
 * Commands are added here as validation rules introduce fix options that
 * reference them.
 *
 * Each fixable command provides a static fromPayload() method that converts
 * the raw JSON payload from the client into a typed command instance.
 *
 * Usage:
 *   const command = dispatcher.create('RemoveCkvsCommand', payload);
 *   await commandBus.execute(command, session);
 */
@Injectable()
export class FixCommandDispatcher {
  private readonly registry = new Map<
    string,
    (payload: Record<string, unknown>) => BaseCommand
  >();

  constructor() {
    this.registerAll();
  }

  /**
   * Opt-in registry for fix commands.
   * Add one line here when a new validation rule introduces a fix command.
   * Each fixable command must provide a static fromPayload() method.
   */
  private registerAll(): void {
    this.registry.set('DeleteStaleManualUsecaseEditCommand', payload =>
      DeleteStaleManualUsecaseEditCommand.fromPayload(payload),
    );
    this.registry.set('ResolveSameGkvCollisionCommand', payload =>
      ResolveSameGkvCollisionCommand.fromPayload(payload),
    );
    this.registry.set('RemoveCkvsCommand', payload =>
      RemoveCkvsCommand.fromPayload(payload),
    );
  }

  /**
   * Resolve a factory for the given command type.
   * Returns undefined if the command type is not registered.
   */
  resolve(
    commandType: string,
  ): ((payload: Record<string, unknown>) => BaseCommand) | undefined {
    return this.registry.get(commandType);
  }

  /**
   * Build the command for the given command type from a client payload.
   * Throws InvalidInputException (HTTP 400) if the command type is not registered.
   */
  create(commandType: string, payload: Record<string, unknown>): BaseCommand {
    const factory = this.resolve(commandType);
    if (!factory) {
      throw new InvalidInputException(
        `Unknown fix command type: ${commandType}`,
      );
    }
    return factory(payload);
  }
}
