/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Generic worker task structure.
 * Platform-agnostic task format for worker execution.
 */
export interface WorkerTask<TInput = unknown, TContext = unknown> {
  /** Unique key identifying the handler to execute */
  handlerKey: string;

  /** Serializable input data for the handler */
  input: TInput;

  /** Optional serializable context data */
  context?: TContext;
}

/**
 * Generic worker result structure.
 * Platform-agnostic result format from worker execution.
 */
export interface WorkerResult<TData = unknown> {
  /** Whether the task executed successfully */
  success: boolean;

  /** Result data if successful */
  data?: TData;

  /** Error message if failed */
  error?: string;

  /** Detailed error information for logging and debugging */
  errorDetails?: WorkerErrorDetails;
}

/**
 * Detailed error information from worker execution.
 * Provides comprehensive context for error logging and debugging.
 */
export interface WorkerErrorDetails {
  /** Error stack trace */
  stack?: string;

  /** Error type/constructor name */
  type?: string;

  /** Handler key that was being executed */
  handlerKey?: string;

  /** Worker identifier */
  workerId?: string;

  /** Task execution start time */
  startTime?: Date;

  /** Task execution duration in milliseconds */
  duration?: number;

  /** Additional context information */
  context?: Record<string, unknown>;
}
