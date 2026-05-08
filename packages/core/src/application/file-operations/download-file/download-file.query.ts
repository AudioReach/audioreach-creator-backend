/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../shared/base-query.js';

/**
 * Query to download the .acdb and .awsp files for a project.
 * Dispatched via QueryBus — read-only operation.
 */
export class DownloadFileQuery extends BaseQuery {
  constructor(
    public readonly projectId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
