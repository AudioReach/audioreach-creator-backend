/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';

/**
 * Query to retrieve SPF module instances for a given set of system IDs.
 *
 * projectId:           raw project system ID — resolved to fileSystemId
 *                      inside the handler via ProjectQueryService (same
 *                      pattern as GetAllUseCasesQuery and GetCkvCalibrationDataQuery)
 * systemIds:           module instance system IDs (nodes.system_id)
 * includeTuningConfig: when true, each module result includes CKV/TKV
 *                      catalogue data (parameter names only, no binary payloads)
 */
export class QuerySpfModulesQuery extends BaseQuery {
  constructor(
    public readonly systemIds: number[],
    public readonly projectId: number,
    public readonly includeTuningConfig: boolean,
    clientId: string,
  ) {
    super(clientId);
  }
}
