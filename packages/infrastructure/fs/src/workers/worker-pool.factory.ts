import {NodeWorkerPoolAdapter} from './node-worker-pool.adapter.js';
import type {WorkerPoolPort, Logger} from '@arc/core';
import * as path from 'path';
import {fileURLToPath} from 'url';

/**
 * Factory function to create a worker pool with automatic path resolution.
 * Resolves the worker script path relative to this module.
 * Uses default registry configuration from core layer.
 *
 * @param poolSize - Optional pool size (defaults to CPU count - 1)
 * @param logger - Optional logger instance to pass to workers
 * @returns WorkerPoolPort instance ready to use
 */
export function createWorkerPool(
  poolSize?: number,
  logger?: Logger,
): WorkerPoolPort {
  // Resolve the path to the worker script relative to this file
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Use generic worker that can handle any task type
  const workerScriptPath = path.join(__dirname, 'generic.worker.js');

  return new NodeWorkerPoolAdapter(
    workerScriptPath,
    poolSize,
    undefined, // Use default timeout
    logger,
  );
}
