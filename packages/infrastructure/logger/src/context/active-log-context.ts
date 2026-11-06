/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Request-scoped values that the logger adds to every record written while
 * the context is active. Infrastructure only: core never reads it.
 */
export interface ActiveLogContext {
  /** The calling client's name, from its verified access token */
  readonly clientName?: string;
  /** The calling client's launch ID, from `X-ARC-Client-Instance-Id` */
  readonly clientInstanceId?: string;
  /** The project the request is about, from the matched route */
  readonly projectId?: string;
}

/**
 * Port for the active log context (OpenTelemetry LLD §8.1).
 *
 * Phase 1 implements it with `AsyncLocalStorage`; the OpenTelemetry phase
 * replaces the implementation with the OpenTelemetry context.
 */
export interface ActiveLogContextProvider {
  /** The context of the current async execution, or an empty context. */
  current(): ActiveLogContext;

  /** Runs `fn` with `context` active for it and everything it schedules. */
  run<T>(context: ActiveLogContext, fn: () => T): T;

  /**
   * Adds `values` to the context of the innermost active `run`, for every
   * record written after this call by any code of that run, including code
   * already scheduled. Keys whose value is `undefined` are ignored. Outside
   * a `run`, does nothing.
   *
   * Lets each request stage add what it has learned (the route's project
   * once routed, the client name once the token is verified) without
   * wrapping the rest of the request in a nested `run`.
   */
  enrich(values: ActiveLogContext): void;
}
