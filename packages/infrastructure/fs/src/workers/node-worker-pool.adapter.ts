import {Worker} from 'node:worker_threads';
import * as os from 'node:os';
import type {WorkerPoolPort, WorkerTask, WorkerResult, Logger} from '@arc/core';

// Default worker pool size: CPU count - 1 (leave one for main thread)
const DEFAULT_WORKER_POOL_SIZE = Math.max(1, os.cpus().length - 1);

// Default task timeout: 30 seconds
const DEFAULT_TASK_TIMEOUT_MS = 30_000;

interface QueuedTask {
  task: any;
  resolve: (result: any) => void;
  reject: (error: Error) => void;
}

/**
 * Node.js implementation of WorkerPoolPort using worker_threads.
 * Manages a pool of generic workers for parallel task execution.
 */
export class NodeWorkerPoolAdapter implements WorkerPoolPort {
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private taskQueue: QueuedTask[] = [];
  private isDisposed = false;

  constructor(
    private readonly workerScriptPath: string,
    private readonly poolSize: number = DEFAULT_WORKER_POOL_SIZE,
    private readonly taskTimeoutMs: number = DEFAULT_TASK_TIMEOUT_MS,
    private readonly logger?: Logger,
  ) {
    this.initializePool();
  }

  isThreadingSupported(): boolean {
    return true; // worker_threads always available in Node.js
  }

  async executeTask<TInput = unknown, TContext = unknown, TData = unknown>(
    task: WorkerTask<TInput, TContext>,
  ): Promise<WorkerResult<TData>> {
    if (this.isDisposed) {
      throw new Error('Worker pool has been disposed');
    }

    return new Promise((resolve, reject) => {
      this.taskQueue.push({task: task as any, resolve, reject});
      this.processQueue();
    });
  }

  async executeParallel<TInput = unknown, TContext = unknown, TData = unknown>(
    tasks: WorkerTask<TInput, TContext>[],
  ): Promise<WorkerResult<TData>[]> {
    if (this.isDisposed) {
      throw new Error('Worker pool has been disposed');
    }

    return Promise.all(
      tasks.map(task => this.executeTask<TInput, TContext, TData>(task)),
    );
  }

  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.taskQueue = [];

    await Promise.all(this.workers.map(worker => worker.terminate()));
    this.workers = [];
    this.availableWorkers = [];
  }

  /**
   * Initialize the worker pool
   * Workers use default registry configuration from core layer
   */
  private initializePool(): void {
    for (let i = 0; i < this.poolSize; i++) {
      // Pass worker data including logger configuration and worker ID
      const workerData = {
        workerId: `worker-${i}`,
        hasLogger: !!this.logger,
      };

      const worker = new Worker(this.workerScriptPath, {
        workerData,
      });

      // Handle unexpected worker errors
      worker.on('error', error => {
        if (this.logger) {
          this.logger.logError({
            component: 'WorkerPool',
            action: 'worker_error',
            tag: 'worker-lifecycle',
            msg: `Worker ${i} encountered an error`,
            timestamp: new Date(),
            error,
          });
        } else {
          console.error(`Worker ${i} error:`, error);
        }
      });

      worker.on('exit', code => {
        if (code !== 0 && !this.isDisposed) {
          if (this.logger) {
            this.logger.logError({
              component: 'WorkerPool',
              action: 'worker_exit',
              tag: 'worker-lifecycle',
              msg: `Worker ${i} exited with non-zero code: ${code}`,
              timestamp: new Date(),
              error: new Error(`Worker exited with code ${code}`),
            });
          } else {
            console.error(`Worker ${i} exited with code ${code}`);
          }
        }
      });

      this.workers.push(worker);
      this.availableWorkers.push(worker);
    }
  }

  /**
   * Process queued tasks with available workers.
   * Includes timeout handling to prevent memory leaks from hung workers.
   */
  private processQueue(): void {
    while (this.taskQueue.length > 0 && this.availableWorkers.length > 0) {
      const worker = this.availableWorkers.pop()!;
      const {task, resolve, reject} = this.taskQueue.shift()!;

      let timeoutId: NodeJS.Timeout | null = null;
      let completed = false;

      // Centralized cleanup function
      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        worker.off('message', messageHandler);
        worker.off('error', errorHandler);
        completed = true;
      };

      const messageHandler = (result: WorkerResult) => {
        if (completed) return; // Already handled (timeout or error)
        cleanup();

        // Log worker task errors if the result indicates failure
        const resultWithDetails = result as any;
        if (!result.success && resultWithDetails.errorDetails && this.logger) {
          this.logger.logError({
            component: 'WorkerPool',
            action: 'worker_task_error',
            tag: 'worker-task',
            msg: `Worker task failed: ${result.error}`,
            timestamp: new Date(),
            error: new Error(result.error || 'Unknown worker error'),
            clientId: resultWithDetails.errorDetails.context
              ?.clientId as string,
            projectId: resultWithDetails.errorDetails.context
              ?.projectId as string,
          });

          // Log additional context if available
          if (resultWithDetails.errorDetails.stack) {
            this.logger.logError({
              component: 'WorkerPool',
              action: 'worker_task_stack_trace',
              tag: 'worker-task',
              msg: `Stack trace for handler ${resultWithDetails.errorDetails.handlerKey} in ${resultWithDetails.errorDetails.workerId}`,
              timestamp: new Date(),
              error: {
                name: resultWithDetails.errorDetails.type || 'Error',
                message: result.error || 'Unknown error',
                stack: resultWithDetails.errorDetails.stack,
              } as Error,
            });
          }
        }

        this.availableWorkers.push(worker);
        resolve(result);
        this.processQueue();
      };

      const errorHandler = (error: Error) => {
        if (completed) return; // Already handled (timeout or message)
        cleanup();

        // Log task execution error
        if (this.logger) {
          this.logger.logError({
            component: 'WorkerPool',
            action: 'task_execution_error',
            tag: 'worker-task',
            msg: `Task execution failed for handler: ${task.handlerKey}`,
            timestamp: new Date(),
            error,
          });
        }

        this.availableWorkers.push(worker);
        reject(error);
        this.processQueue();
      };

      // Set timeout to prevent indefinite hangs
      timeoutId = setTimeout(() => {
        if (completed) return; // Already handled (message or error)
        cleanup();

        const timeoutError = new Error(
          `Worker task timeout after ${this.taskTimeoutMs}ms. Task may be stuck or taking too long.`,
        );

        // Log task timeout
        if (this.logger) {
          this.logger.logError({
            component: 'WorkerPool',
            action: 'task_timeout',
            tag: 'worker-task',
            msg: `Task timeout for handler: ${task.handlerKey}`,
            timestamp: new Date(),
            error: timeoutError,
          });
        }

        this.availableWorkers.push(worker);
        reject(timeoutError);
        this.processQueue();
      }, this.taskTimeoutMs);

      worker.once('message', messageHandler);
      worker.once('error', errorHandler);
      worker.postMessage(task);
    }
  }
}
