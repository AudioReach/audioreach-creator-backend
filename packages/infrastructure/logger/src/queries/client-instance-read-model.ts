/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * One client launch, summarized from the log records that belong to it. A
 * launch is identified by `clientName` and `clientInstanceId` together: the
 * name is verified from the access token, the launch ID is reported by the
 * client.
 */
export interface ClientInstanceReadModel {
  /** The client's name, such as `audioreach-creator-ui`, when known */
  readonly clientName?: string;
  /** The launch ID the client sent in `X-ARC-Client-Instance-Id` */
  readonly clientInstanceId: string;
  /** Projects the launch has records for, in ascending order */
  readonly projectIds: string[];
  /** Earliest record timestamp, ISO-8601 */
  readonly firstTimestamp: string;
  /** Latest record timestamp, ISO-8601 */
  readonly lastTimestamp: string;
  /** Number of records */
  readonly recordCount: number;
  /** Number of `ERROR` and `CRITICAL` records */
  readonly errorCount: number;
}
