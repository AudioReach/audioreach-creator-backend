/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';

export class GetControlLinkPropertiesQuery extends BaseQuery {
  constructor(
    public readonly controlLinkSystemId: number,
    public readonly projectId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
