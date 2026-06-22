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
  BulkReadRepository,
  SpfModuleQueryService,
  SpfModuleDefinitionQueryService,
  ContainerQueryService,
} from '@arc/core';
import {DataSource} from 'typeorm';
import {DbUseCaseQueryService} from './usecase/index.js';
import {DbProjectQueryService} from './db-project-query-service.js';
import {TypeOrmValidationQueryRepository} from '../repositories/validation/typeorm-validation-query.repository.js';
import {TypeOrmBulkReadRepository} from '../repositories/bulk-read/typeorm-bulk-read.repository.js';
import {EditActionsQueryService} from './edit-session/edit-actions-query-service.js';
import {DbSpfModuleQueryService} from './spf-module/db-spf-module-query-service.js';
import {DbSpfModuleDefinitionQueryService} from './spf-module-definition/db-spf-module-definition-query-service.js';
import {DbContainerQueryService} from './container/db-container-query-service.js';

// Database implementation of ModuleQueryService
class DbModuleQueryService implements ModuleQueryService {
  // Add query methods here as needed
}

export class DbQueryServices implements QueryServices {
  readonly modulesQueryService: ModuleQueryService;
  readonly useCaseQueryService: UseCaseQueryService;
  readonly projectQueryService: ProjectQueryService;
  readonly validationQueryService: ValidationQueryRepository;
  readonly bulkReadRepository: BulkReadRepository;
  readonly spfModuleQueryService: SpfModuleQueryService;
  readonly spfModuleDefinitionQueryService: SpfModuleDefinitionQueryService;
  readonly containerQueryService: ContainerQueryService;

  constructor(dataSource: DataSource) {
    const editActionsQueryService = new EditActionsQueryService(dataSource);

    this.modulesQueryService = new DbModuleQueryService();
    this.useCaseQueryService = new DbUseCaseQueryService(dataSource);
    this.projectQueryService = new DbProjectQueryService(dataSource);
    this.validationQueryService = new TypeOrmValidationQueryRepository(
      dataSource,
    );
    this.bulkReadRepository = new TypeOrmBulkReadRepository(dataSource);

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

    this.containerQueryService = new DbContainerQueryService(
      dataSource,
      editActionsQueryService,
    );
  }
}
