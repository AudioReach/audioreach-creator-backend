/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';

/**
 * Query to retrieve SPF module instances for a given set of system IDs.
 *
 * projectId:    raw project system ID — resolved to fileSystemId inside the
 *               handler via ProjectQueryService (same pattern as GetAllUseCasesQuery)
 * systemIds:    module instance system IDs (nodes.system_id)
 * includeCkvs:  when true, include CKV tuning catalogue (key-value selectors + param names)
 * includeTags:  when true, include tag/TKV tuning catalogue (key-value selectors + param names)
 */
export class SpfModulesQuery extends BaseQuery {
  constructor(
    public readonly systemIds: number[],
    public readonly projectId: number,
    public readonly includeCkvs: boolean,
    public readonly includeTags: boolean,
    clientId: string,
  ) {
    super(clientId);
  }
}
