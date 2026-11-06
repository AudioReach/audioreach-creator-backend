/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {AsyncLocalStorage} from 'node:async_hooks';
import {fileURLToPath} from 'node:url';
import type {Logger, LogData, WorkerTask} from '@arc/core';
import {NodeWorkerPoolAdapter} from '../../../src/workers/node-worker-pool.adapter.js';

const WORKER_SCRIPT = fileURLToPath(
  new URL('../../fixtures/scripted.worker.mjs', import.meta.url),
);

interface ScriptedInput {
  delayMs?: number;
  outcome?: 'success' | 'failure' | 'hang';
}

interface Captured {
  eventName: string;
  description: string;
  requestId: string | undefined;
}

/**
 * Stands in for the logger's request context: each log call records the
 * request ID active when it was made, as PinoLogService does.
 */
const requestContext = new AsyncLocalStorage<string>();

describe('NodeWorkerPoolAdapter', () => {
  let captured: Captured[];
  let logger: Logger;
  let pool: NodeWorkerPoolAdapter | undefined;

  beforeEach(() => {
    captured = [];
    const capture = (data: LogData) => {
      captured.push({
        eventName: data.eventName,
        description: data.description,
        requestId: requestContext.getStore(),
      });
    };
    logger = {
      logVerbose: capture,
      logDebug: capture,
      logInfo: capture,
      logWarn: capture,
      logError: capture,
      logCritical: capture,
    };
  });

  afterEach(async () => {
    await pool?.dispose();
    pool = undefined;
  });

  const createPool = (poolSize: number, taskTimeoutMs = 5000) => {
    pool = new NodeWorkerPoolAdapter(
      WORKER_SCRIPT,
      poolSize,
      taskTimeoutMs,
      logger,
    );
    return pool;
  };

  const task = (
    handlerKey: string,
    input: ScriptedInput,
  ): WorkerTask<ScriptedInput> => ({handlerKey, input});

  /** Submits a task from inside the given request's context. */
  const submit = (
    p: NodeWorkerPoolAdapter,
    requestId: string,
    t: WorkerTask<ScriptedInput>,
  ) => requestContext.run(requestId, () => p.executeTask(t));

  it('resolves successful tasks', async () => {
    const p = createPool(1);
    const result = await submit(p, 'req-a', task('ok', {}));
    expect(result).toEqual({success: true, data: 'ok'});
    expect(captured).toEqual([]);
  });

  it('logs a failed task in the submitting request context', async () => {
    const p = createPool(1);

    const result = await submit(
      p,
      'req-a',
      task('fails', {outcome: 'failure'}),
    );

    expect(result.success).toBe(false);
    expect(captured).toEqual([
      {
        eventName: 'worker_task_error',
        description: 'Worker task failed: scripted failure for fails',
        requestId: 'req-a',
      },
    ]);
  });

  it('logs a queued failed task in its own context, not the one that freed the worker', async () => {
    const p = createPool(1);

    // req-a occupies the only worker; req-b queues and is dispatched from
    // req-a's completion handler.
    const a = submit(p, 'req-a', task('slow-ok', {delayMs: 30}));
    const b = submit(p, 'req-b', task('queued-fails', {outcome: 'failure'}));

    await Promise.all([a, b]);

    expect(captured).toEqual([
      expect.objectContaining({
        eventName: 'worker_task_error',
        requestId: 'req-b',
      }),
    ]);
  });

  it('logs a queued task timeout in its own context', async () => {
    const p = createPool(1, 200);

    const a = submit(p, 'req-a', task('slow-ok', {delayMs: 30}));
    const b = submit(p, 'req-b', task('queued-hangs', {outcome: 'hang'}));

    await a;
    await expect(b).rejects.toThrow(/timeout/);

    expect(captured).toEqual([
      expect.objectContaining({eventName: 'task_timeout', requestId: 'req-b'}),
    ]);
  });

  it('keeps concurrent tasks in their own contexts', async () => {
    const p = createPool(2);
    const run = (id: string, delayMs: number) =>
      submit(p, id, task(id, {outcome: 'failure', delayMs}));

    // req-c queues behind req-a and req-b and is dispatched by whichever
    // finishes first. Each task is named after its request, and the failure
    // message names the task.
    await Promise.all([run('req-a', 20), run('req-b', 5), run('req-c', 1)]);

    expect(captured).toHaveLength(3);
    for (const entry of captured) {
      expect(entry.description).toBe(
        `Worker task failed: scripted failure for ${entry.requestId}`,
      );
    }
  });
});
