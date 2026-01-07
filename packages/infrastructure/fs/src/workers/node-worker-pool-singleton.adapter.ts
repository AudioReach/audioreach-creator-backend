import type {WorkerPoolPort} from '@arc/core';
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
    task: any,
  ): Promise<any> {
    return NodeWorkerPoolSingleton.instance!.executeTask<
      TInput,
      TContext,
      TData
    >(task);
  }

  async executeParallel<TInput = unknown, TContext = unknown, TData = unknown>(
    tasks: any[],
  ): Promise<any[]> {
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
