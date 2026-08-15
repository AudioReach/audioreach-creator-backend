/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {GetVcpmCkvQuery} from './get-vcpm-ckv.query.js';
import type {VcpmCkvDto} from '../dto/subgraph-write-result-types.js';
import {Result} from '../../../shared/result/result.js';

export class GetVcpmCkvHandler implements QueryHandler<
  GetVcpmCkvQuery,
  Promise<Result<VcpmCkvDto>>
> {
  constructor(_queryServices: QueryServices) {}

  handle(_query: GetVcpmCkvQuery): Promise<Result<VcpmCkvDto>> {
    throw new Error('GetVcpmCkvHandler not implemented yet');
  }
}
