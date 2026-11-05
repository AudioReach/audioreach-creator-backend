/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {LogLevel} from '@arc/core';

/**
 * A log record a client wrote and sent to the API (design §7). It carries
 * the client's own identity, never the server's, and no request context.
 */
export interface ClientLogRecord {
  readonly level: LogLevel;
  readonly eventName: string;
  readonly description: string;
  readonly component: string;
  readonly tag: string;
  /** When the client produced the record */
  readonly timestamp: Date;
  readonly projectId?: string;
  readonly error?: string;
  /** The client's name from its access token, e.g. `audioreach-creator-ui` */
  readonly clientName: string;
  /** The launch that wrote and sent the record, from `X-ARC-Client-Instance-Id` */
  readonly clientInstanceId: string;
}

/** Stores log records sent by clients. Best effort; never throws. */
export interface ClientLogWriter {
  write(record: ClientLogRecord): void;
}
