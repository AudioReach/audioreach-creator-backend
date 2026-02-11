/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UnitOfWork} from './unit-of-work.js';

/**
 * Result of creating a Unit of Work with its lifecycle management.
 */
export interface UnitOfWorkContext {
  /** The Unit of Work instance for the current operation */
  readonly uow: UnitOfWork;

  /** Release function to clean up resources (QueryRunner, connections, etc.) */
  readonly release: () => Promise<void>;
}

/**
 * Factory function type for creating Unit of Work instances.
 * Each invocation creates a new UOW with its own database connection.
 */
export type UnitOfWorkFactory = () => Promise<UnitOfWorkContext>;
