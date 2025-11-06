import {parentPort} from 'worker_threads';
import type {WorkerTask, WorkerResult} from '@arc/core';
import {NodeRegistry} from './node-registry.adapter.js';

if (!parentPort) {
  throw new Error('This script must be run as a worker thread');
}

// Initialize registry with defaults from core layer
// This makes the worker completely generic - it doesn't know what handlers exist
const registry = new NodeRegistry();

/**
 * Generic worker message handler.
 * Worker has ZERO domain knowledge - just executes handlers from registry.
 *
 * This worker can handle ANY task type (chunk parsing, entity assembly, validation, etc.)
 * as long as the handler is registered in the registry.
 */
parentPort.on('message', async (task: WorkerTask) => {
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
    // 4. Send error response
    //TODO: improve the error response.
    const response: WorkerResult = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };

    parentPort!.postMessage(response);
  }
});
