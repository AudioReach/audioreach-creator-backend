/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ValidationIssue} from '../../../validation/issue.js';

export const FILE_OPEN_STATUS = {
  Ready: 'READY',
  PendingDataLossAck: 'PENDING_DATA_LOSS_ACK',
} as const;
export type FileOpenStatus =
  (typeof FILE_OPEN_STATUS)[keyof typeof FILE_OPEN_STATUS];

export interface ArcDbFileInit {
  systemId: number;
  description: string;
  metadata: string;
  fileName: string;
  isTarget: boolean;
  projectSystemId: number;
  openStatus?: FileOpenStatus;
  dataLossIssues?: ValidationIssue[];
}

export class ArcDbFile {
  readonly systemId: number;
  readonly description: string;
  readonly metadata: string;
  readonly fileName: string;
  readonly isTarget: boolean;
  readonly projectSystemId: number;
  readonly openStatus: FileOpenStatus;
  readonly dataLossIssues: ReadonlyArray<ValidationIssue>;

  constructor(initParams: ArcDbFileInit) {
    this.systemId = initParams.systemId;
    this.description = initParams.description;
    this.metadata = initParams.metadata;
    this.fileName = initParams.fileName;
    this.isTarget = initParams.isTarget;
    this.projectSystemId = initParams.projectSystemId;
    this.openStatus = initParams.openStatus ?? FILE_OPEN_STATUS.Ready;
    this.dataLossIssues = initParams.dataLossIssues ?? [];
  }
}
