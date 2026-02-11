/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';

export class GetModuleCompactQuery extends BaseQuery {
  constructor(
    public readonly instanceId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
