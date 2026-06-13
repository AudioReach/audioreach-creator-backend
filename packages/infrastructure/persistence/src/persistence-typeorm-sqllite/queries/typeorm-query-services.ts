/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  QueryServices,
  ModuleQueryService,
  UseCaseQueryService,
  ProjectQueryService,
  ValidationQueryRepository,
  BulkReadQueryService,
  SpfModuleQueryService,
  SpfModuleDefinitionQueryService,
} from '@arc/core';
import {DataSource} from 'typeorm';
import {DbUseCaseQueryService} from './usecase/index.js';
import {DbProjectQueryService} from './db-project-query-service.js';
import {TypeOrmValidationQueryRepository} from '../repositories/validation/typeorm-validation-query.repository.js';
import {TypeOrmBulkReadQueryService} from './bulk-read/typeorm-bulk-read-query-service.js';
import {EditActionsQueryService} from './edit-session/edit-actions-query-service.js';
import {DbSpfModuleQueryService} from './spf-module/db-spf-module-query-service.js';
import {DbSpfModuleDefinitionQueryService} from './spf-module-definition/db-spf-module-definition-query-service.js';

// Database implementation of ModuleQueryService
class DbModuleQueryService implements ModuleQueryService {
  // Add query methods here as needed
}

export class DbQueryServices implements QueryServices {
  readonly modulesQueryService: ModuleQueryService;
  readonly useCaseQueryService: UseCaseQueryService;
  readonly projectQueryService: ProjectQueryService;
  readonly validationQueryService: ValidationQueryRepository;
  readonly bulkReadQueryService: BulkReadQueryService;
  readonly spfModuleQueryService: SpfModuleQueryService;
  readonly spfModuleDefinitionQueryService: SpfModuleDefinitionQueryService;

  constructor(dataSource: DataSource) {
    const editActionsQueryService = new EditActionsQueryService(dataSource);

    this.modulesQueryService = new DbModuleQueryService();
    this.useCaseQueryService = new DbUseCaseQueryService(dataSource);
    this.projectQueryService = new DbProjectQueryService(dataSource);
    this.validationQueryService = new TypeOrmValidationQueryRepository(
      dataSource,
    );
    this.bulkReadQueryService = new TypeOrmBulkReadQueryService(dataSource);

    // SPF module services — shared EditActionsQueryService instance
    // Definition service created first — injected into module service
    this.spfModuleDefinitionQueryService =
      new DbSpfModuleDefinitionQueryService(
        dataSource,
        editActionsQueryService,
      );
    this.spfModuleQueryService = new DbSpfModuleQueryService(
      dataSource,
      editActionsQueryService,
      this.spfModuleDefinitionQueryService,
    );
  }
}
