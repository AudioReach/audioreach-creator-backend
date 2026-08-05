/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {LogEntryReadModel} from './log-entry-read-model.js';

export interface LogQueryService {
  getLogsByProject(
    projectId: string,
    clientId: string,
  ): Promise<LogEntryReadModel[]>;
}
