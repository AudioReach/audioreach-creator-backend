/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';

export class GetContainerPropertyDefinitionQuery extends BaseQuery {
  constructor(
    public readonly projectId: number,
    public readonly propertySystemId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
