/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {GetVcpmCalDataQuery} from './get-vcpm-cal-data.query.js';
import type {CkvCalDataDto} from '../../spf-module/get-cal-data/ckv-cal-data-dto.js';
import {Result} from '../../../shared/result/result.js';

export class GetVcpmCalDataHandler implements QueryHandler<
  GetVcpmCalDataQuery,
  Promise<Result<CkvCalDataDto>>
> {
  constructor(_queryServices: QueryServices) {}

  handle(_query: GetVcpmCalDataQuery): Promise<Result<CkvCalDataDto>> {
    throw new Error('GetVcpmCalDataHandler not implemented yet');
  }
}
