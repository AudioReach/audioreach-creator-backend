/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';
import type {FilterExpression} from '../../../../shared/filter/filter-expression.js';

export class GetAllUseCasesQuery extends BaseQuery {
  constructor(
    public readonly projectId: number,
    clientId: string,
    public readonly filter?: FilterExpression,
  ) {
    super(clientId);
  }
}
