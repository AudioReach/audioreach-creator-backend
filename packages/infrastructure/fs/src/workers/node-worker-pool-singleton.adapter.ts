/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {WorkerPoolPort, WorkerTask, WorkerResult} from '@arc/core';
import {createWorkerPool} from './worker-pool.factory.js';

/**
 * Singleton wrapper for NodeWorkerPoolAdapter.
 * Ensures a single worker pool instance is shared across the application
 * and properly disposed on shutdown.
 */
export class NodeWorkerPoolSingleton implements WorkerPoolPort {
  private static instance: WorkerPoolPort | null = null;

  constructor() {
    if (!NodeWorkerPoolSingleton.instance) {
      NodeWorkerPoolSingleton.instance = createWorkerPool();
    }
  }

  isThreadingSupported(): boolean {
    return NodeWorkerPoolSingleton.instance!.isThreadingSupported();
  }

  async executeTask<TInput = unknown, TContext = unknown, TData = unknown>(
    task: WorkerTask<TInput, TContext>,
  ): Promise<WorkerResult<TData>> {
    return NodeWorkerPoolSingleton.instance!.executeTask<
      TInput,
      TContext,
      TData
    >(task);
  }

  async executeParallel<TInput = unknown, TContext = unknown, TData = unknown>(
    tasks: WorkerTask<TInput, TContext>[],
  ): Promise<WorkerResult<TData>[]> {
    return NodeWorkerPoolSingleton.instance!.executeParallel<
      TInput,
      TContext,
      TData
    >(tasks);
  }

  async dispose(): Promise<void> {
    if (NodeWorkerPoolSingleton.instance) {
      await NodeWorkerPoolSingleton.instance.dispose();
      NodeWorkerPoolSingleton.instance = null;
    }
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): WorkerPoolPort {
    if (!NodeWorkerPoolSingleton.instance) {
      NodeWorkerPoolSingleton.instance = createWorkerPool();
    }
    return NodeWorkerPoolSingleton.instance;
  }
}
