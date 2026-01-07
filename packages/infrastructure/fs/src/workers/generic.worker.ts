// IMPORTANT: reflect-metadata must be imported first, before any other imports
// This polyfill is required for class-transformer decorators to work in worker threads
import 'reflect-metadata';
import {parentPort, workerData} from 'node:worker_threads';
import type {WorkerTask, WorkerResult} from '@arc/core';
import {NodeRegistry} from './node-registry.adapter.js';

if (!parentPort) {
  throw new Error('This script must be run as a worker thread');
}

// Initialize registry with defaults from core layer
// This makes the worker completely generic - it doesn't know what handlers exist
const registry = new NodeRegistry();

// Get worker ID from workerData
const workerId = workerData?.workerId || 'unknown-worker';

/**
 * Generic worker message handler.
 * Worker has ZERO domain knowledge - just executes handlers from registry.
 *
 * This worker can handle ANY task type (chunk parsing, entity assembly, validation, etc.)
 * as long as the handler is registered in the registry.
 */
parentPort.on('message', async (task: WorkerTask) => {
  const startTime = new Date();

  try {
    // 1. Lookup handler by key from registry
    const handler = registry.get(task.handlerKey);

    // 2. Execute handler with input and context
    const result = await handler(task.input, task.context);

    // 3. Send success response
    const response: WorkerResult = {
      success: true,
      data: result,
    };

    parentPort!.postMessage(response);
  } catch (error) {
    // 4. Send detailed error response for proper logging
    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    const response: WorkerResult = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      errorDetails: {
        stack: error instanceof Error ? error.stack : undefined,
        type: error instanceof Error ? error.constructor.name : 'Unknown',
        handlerKey: task.handlerKey,
        workerId,
        startTime,
        duration,
        context: {
          taskInput:
            typeof task.input === 'object' ? 'object' : typeof task.input,
          taskContext: task.context ? Object.keys(task.context) : undefined,
        },
      },
    } as WorkerResult;

    parentPort!.postMessage(response);
  }
});
