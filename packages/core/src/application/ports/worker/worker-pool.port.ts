/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {WorkerTask, WorkerResult} from './worker-types.js';

/**
 * Port interface for worker pool abstraction.
 * Enables parallel task execution across different platforms (Node.js, React Native).
 * Generic to support different types of tasks (chunk parsing, entity assembly, etc.).
 */
export interface WorkerPoolPort {
  /**
   * Check if threading is supported on the current platform
   */
  isThreadingSupported(): boolean;

  /**
   * Execute a single task
   */
  executeTask<TInput = unknown, TContext = unknown, TData = unknown>(
    task: WorkerTask<TInput, TContext>,
  ): Promise<WorkerResult<TData>>;

  /**
   * Execute multiple tasks in parallel
   */
  executeParallel<TInput = unknown, TContext = unknown, TData = unknown>(
    tasks: WorkerTask<TInput, TContext>[],
  ): Promise<WorkerResult<TData>[]>;

  /**
   * Clean up worker pool resources
   */
  dispose(): Promise<void>;
}
