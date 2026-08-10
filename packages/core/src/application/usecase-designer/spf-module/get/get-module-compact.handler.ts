/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {GetModuleCompactQuery} from './get-module-compact.query.js';
import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {ModuleCompactDto} from './module-compact-dto.js';

export class GetModuleCompactHandler implements QueryHandler<
  GetModuleCompactQuery,
  ModuleCompactDto
> {
  constructor(private queryServices: QueryServices) {}

  handle(_query: GetModuleCompactQuery): ModuleCompactDto {
    // TODO: Implement actual module query logic - will include querying from read models, applying filters, and returning proper domain data
    console.warn('GetModuleCompactHandler: Using placeholder implementation');
    console.warn('UnitOfWork available:', !!this.queryServices);

    return {
      systemId: '-1',
      name: 'Placeholder Module',
      alias: 'placeholder',
      isEnabled: false,
    };
  }
}
