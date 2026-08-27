/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../shared/base-query.js';

export class GetProjectsQuery extends BaseQuery {
  constructor() {
    super('');
  }
}

export interface ProjectInfoResult {
  projectId: number;
  name: string;
  description: string;
  type: string;
  sessionMode: string;
}
