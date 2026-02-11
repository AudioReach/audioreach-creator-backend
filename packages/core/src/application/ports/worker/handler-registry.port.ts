/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Type definition for handler functions.
 * Handlers receive input and optional context, and return a result.
 */
export type Handler<TInput = unknown, TContext = unknown, TResult = unknown> = (
  input: TInput,
  context?: TContext,
) => TResult | Promise<TResult>;

/**
 * Port interface for handler registry.
 * Defines the contract for registering and retrieving handlers.
 *
 * This abstraction allows the Application layer to remain independent
 * of infrastructure-specific worker implementations.
 */
export interface HandlerRegistryPort {
  /**
   * Get a handler by its key
   * @param handlerKey - Unique identifier for the handler (e.g., 'parseChunk', 'buildEntity')
   * @returns The handler function
   * @throws Error if handler not found
   */
  get(handlerKey: string): Handler;

  /**
   * Check if a handler exists
   * @param handlerKey - Unique identifier for the handler
   * @returns true if handler exists, false otherwise
   */
  has(handlerKey: string): boolean;
}
