/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  SpfModuleDefinitionQueryService,
  ParameterDefinitionQueryService,
} from '@arc/core';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {DbParameterDefinitionQueryService} from '../definition/db-parameter-definition-query-service.js';

/**
 * Database implementation of SpfModuleDefinitionQueryService.
 * Owns the ParameterDefinitionQueryService sub-service.
 */
export class DbSpfModuleDefinitionQueryService implements SpfModuleDefinitionQueryService {
  readonly parameterDefinitionQueryService: ParameterDefinitionQueryService;

  constructor(
    dataSource: DataSource,
    editActionsQueryService: EditActionsQueryService,
  ) {
    this.parameterDefinitionQueryService =
      new DbParameterDefinitionQueryService(
        dataSource,
        editActionsQueryService,
      );
  }
}
