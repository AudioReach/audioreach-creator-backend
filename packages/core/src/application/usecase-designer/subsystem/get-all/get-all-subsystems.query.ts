/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';

/** Query to retrieve all or selected subsystems for a project. */
export class GetAllSubsystemsQuery extends BaseQuery {
  constructor(
    public readonly projectId: number,
    clientId: string,
    public readonly systemIds?: number[],
  ) {
    super(clientId);
  }
}
