/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {GetDriverModuleDefinitionQuery} from './get-driver-module-definition.query.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/index.js';
import {RESULT_KIND} from '../../../../application/shared/result/result.js';
import {
  mapDriverModuleDefinition,
  type DriverModuleDefinitionDto,
} from '../dto/driver-module-definition-dto.js';

/**
 * Handles GetDriverModuleDefinitionQuery.
 *
 * Single-item lookup — throws ResourceNotFoundException on failure rather
 * than returning Result, matching GetSpfModuleDefinitionHandler's
 * get-by-id convention.
 */
export class GetDriverModuleDefinitionHandler implements QueryHandler<
  GetDriverModuleDefinitionQuery,
  Promise<DriverModuleDefinitionDto>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetDriverModuleDefinitionQuery,
  ): Promise<DriverModuleDefinitionDto> {
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    const result =
      await this.queryServices.driverModuleDefinitionQueryService.getDriverModuleDefinition(
        query.moduleSystemId,
        fileSystemId,
      );

    if (result.kind === RESULT_KIND.Fail) {
      throw new ResourceNotFoundException(
        result.issues[0]?.message ??
          `Driver module definition with system ID ${query.moduleSystemId} not found`,
      );
    }

    return mapDriverModuleDefinition(result.data);
  }
}
