/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

// Test worker for NodeWorkerPoolAdapter. Each task's input scripts the reply:
//   {delayMs, outcome: 'success' | 'failure' | 'hang', projectId?}
import {parentPort} from 'node:worker_threads';

parentPort.on('message', task => {
  const {delayMs = 0, outcome = 'success', projectId} = task.input ?? {};
  if (outcome === 'hang') {
    return;
  }
  setTimeout(() => {
    if (outcome === 'failure') {
      parentPort.postMessage({
        success: false,
        error: `scripted failure for ${task.handlerKey}`,
        errorDetails: {
          type: 'ScriptedError',
          handlerKey: task.handlerKey,
          context: {projectId},
        },
      });
      return;
    }
    parentPort.postMessage({success: true, data: task.handlerKey});
  }, delayMs);
});
