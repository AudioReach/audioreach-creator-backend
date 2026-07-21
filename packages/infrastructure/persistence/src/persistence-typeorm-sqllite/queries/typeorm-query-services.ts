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
  KeyValueDefQueryService,
  TagDefinitionQueryService,
  SpfTuningConfigService,
  ContainerQueryService,
  ContainerPropertyDefQueryService,
  SubgraphPropertyDefQueryService,
  DriverModuleDefinitionQueryService,
  DataLinkQueryService,
  ControlLinkQueryService,
  SubsystemQueryService,
  Logger,
} from '@arc/core';
import {DataSource} from 'typeorm';
import {DbUseCaseQueryService} from './usecase/index.js';
import {DbProjectQueryService} from './db-project-query-service.js';
import {TypeOrmValidationQueryRepository} from '../repositories/validation/typeorm-validation-query.repository.js';
import {TypeOrmBulkReadQueryService} from './bulk-read/typeorm-bulk-read-query-service.js';
import {EditActionsQueryService} from './edit-session/edit-actions-query-service.js';
import {DbSpfModuleQueryService} from './spf-module/db-spf-module-query-service.js';
import {DbSpfModuleDefinitionQueryService} from './spf-module-definition/db-spf-module-definition-query-service.js';
import {DbKeyValueDefQueryService} from './key-value/db-key-value-def-query-service.js';
import {DbTagDefinitionQueryService} from './tag-definition/db-tag-definition-query-service.js';
import {DbSpfTuningConfigService} from './spf-module/db-spf-tuning-config-service.js';
import {DbContainerQueryService} from './container/db-container-query-service.js';
import {DbContainerPropertyDefQueryService} from './container-property-definition/db-container-property-def-query-service.js';
import {DbSubgraphPropertyDefQueryService} from './subgraph-property-definition/db-subgraph-property-def-query-service.js';
import {TypeOrmSessionRepository} from '../repositories/session/typeorm-session.repository.js';
import {DbDriverModuleDefinitionQueryService} from './driver-module-definition/db-driver-module-definition-query-service.js';
import {DbDataLinkQueryService} from './link/db-data-link-query-service.js';
import {DbControlLinkQueryService} from './link/db-control-link-query-service.js';
import {DbSubsystemQueryService} from './subsystem/db-subsystem-query-service.js';

class DbModuleQueryService implements ModuleQueryService {}

export class DbQueryServices implements QueryServices {
  readonly modulesQueryService: ModuleQueryService;
  readonly useCaseQueryService: UseCaseQueryService;
  readonly projectQueryService: ProjectQueryService;
  readonly validationQueryService: ValidationQueryRepository;
  readonly bulkReadQueryService: BulkReadQueryService;
  readonly spfModuleQueryService: SpfModuleQueryService;
  readonly spfModuleDefinitionQueryService: SpfModuleDefinitionQueryService;
  readonly keyValueDefQueryService: KeyValueDefQueryService;
  readonly tagDefinitionQueryService: TagDefinitionQueryService;
  readonly spfTuningConfigService: SpfTuningConfigService;
  readonly containerQueryService: ContainerQueryService;
  readonly containerPropertyDefQueryService: ContainerPropertyDefQueryService;
  readonly subgraphPropertyDefQueryService: SubgraphPropertyDefQueryService;
  readonly driverModuleDefinitionQueryService: DriverModuleDefinitionQueryService;
  readonly dataLinkQueryService: DataLinkQueryService;
  readonly controlLinkQueryService: ControlLinkQueryService;
  readonly subsystemQueryService: SubsystemQueryService;

  constructor(dataSource: DataSource, logger?: Logger) {
    const editActionsQueryService = new EditActionsQueryService(
      dataSource.manager,
    );
    const sessionRepo = new TypeOrmSessionRepository(dataSource.manager);

    this.modulesQueryService = new DbModuleQueryService();
    this.projectQueryService = new DbProjectQueryService(dataSource);
    this.validationQueryService = new TypeOrmValidationQueryRepository(
      dataSource,
    );
    this.bulkReadQueryService = new TypeOrmBulkReadQueryService(
      dataSource,
      logger,
    );

    this.keyValueDefQueryService = new DbKeyValueDefQueryService(
      dataSource,
      editActionsQueryService,
    );

    this.tagDefinitionQueryService = new DbTagDefinitionQueryService(
      dataSource,
      editActionsQueryService,
      this.keyValueDefQueryService,
    );

    this.spfModuleDefinitionQueryService =
      new DbSpfModuleDefinitionQueryService(
        dataSource,
        editActionsQueryService,
      );

    // Tuning config service — owns CKV/TKV rows, delegates key-value to
    // KeyValueDefQueryService and tag names/lookups to TagDefinitionQueryService.
    // Instantiated once here and passed into spfModuleQueryService — previously
    // DbSpfModuleQueryService constructed its own separate instance internally,
    // creating two divergent DbSpfTuningConfigService objects.
    this.spfTuningConfigService = new DbSpfTuningConfigService(
      dataSource,
      editActionsQueryService,
      this.keyValueDefQueryService,
      this.tagDefinitionQueryService,
    );

    this.spfModuleQueryService = new DbSpfModuleQueryService(
      dataSource,
      editActionsQueryService,
      this.spfModuleDefinitionQueryService,
      this.spfTuningConfigService,
      this.keyValueDefQueryService,
    );

    this.containerQueryService = new DbContainerQueryService(
      dataSource,
      editActionsQueryService,
    );

    this.driverModuleDefinitionQueryService =
      new DbDriverModuleDefinitionQueryService(
        dataSource,
        editActionsQueryService,
      );

    this.containerPropertyDefQueryService =
      new DbContainerPropertyDefQueryService(
        dataSource,
        editActionsQueryService,
        sessionRepo,
      );

    this.subgraphPropertyDefQueryService =
      new DbSubgraphPropertyDefQueryService(
        dataSource,
        editActionsQueryService,
        sessionRepo,
      );

    this.useCaseQueryService = new DbUseCaseQueryService(
      dataSource,
      editActionsQueryService,
      this.keyValueDefQueryService,
    );

    // Individual link + subsystem query services
    this.dataLinkQueryService = new DbDataLinkQueryService(
      dataSource,
      editActionsQueryService,
    );
    this.controlLinkQueryService = new DbControlLinkQueryService(
      dataSource,
      editActionsQueryService,
    );
    this.subsystemQueryService = new DbSubsystemQueryService(
      dataSource,
      editActionsQueryService,
    );
  }
}
