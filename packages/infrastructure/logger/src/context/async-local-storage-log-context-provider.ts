/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {AsyncLocalStorage} from 'node:async_hooks';
import type {
  ActiveLogContext,
  ActiveLogContextProvider,
} from './active-log-context.js';

const EMPTY_CONTEXT: ActiveLogContext = Object.freeze({});

/**
 * The context of one `run`. `enrich` replaces `context` with a new frozen
 * copy, so every async continuation of the run sees the added values and
 * no reader can mutate what it was given.
 */
interface ContextSlot {
  context: ActiveLogContext;
}

export class AsyncLocalStorageLogContextProvider implements ActiveLogContextProvider {
  private readonly storage = new AsyncLocalStorage<ContextSlot>();

  current(): ActiveLogContext {
    return this.storage.getStore()?.context ?? EMPTY_CONTEXT;
  }

  run<T>(context: ActiveLogContext, fn: () => T): T {
    return this.storage.run({context: Object.freeze(definedOnly(context))}, fn);
  }

  enrich(values: ActiveLogContext): void {
    const slot = this.storage.getStore();
    if (slot !== undefined) {
      slot.context = Object.freeze({...slot.context, ...definedOnly(values)});
    }
  }
}

function definedOnly(values: ActiveLogContext): ActiveLogContext {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  );
}
