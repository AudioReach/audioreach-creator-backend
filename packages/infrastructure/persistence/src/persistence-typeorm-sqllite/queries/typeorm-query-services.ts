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
  SubgraphQueryService,
  SubgraphPropertyDefQueryService,
  DriverModuleDefinitionQueryService,
  LogQueryService,
  DataLinkQueryService,
  ControlLinkQueryService,
  SubsystemQueryService,
  VcpmQueryService,
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
import {DbSubgraphQueryService} from './subgraph/db-subgraph-query-service.js';
import {DbContainerPropertyDefQueryService} from './container-property-definition/db-container-property-def-query-service.js';
import {DbSubgraphPropertyDefQueryService} from './subgraph-property-definition/db-subgraph-property-def-query-service.js';
import {TypeOrmSessionRepository} from '../repositories/session/typeorm-session.repository.js';
import {DbDriverModuleDefinitionQueryService} from './driver-module-definition/db-driver-module-definition-query-service.js';
import {DbDataLinkQueryService} from './link/db-data-link-query-service.js';
import {DbControlLinkQueryService} from './link/db-control-link-query-service.js';
import {DbSubsystemQueryService} from './subsystem/db-subsystem-query-service.js';
import {UseCaseCategoryFetcher} from '../fetchers/usecase-category-fetcher.js';
import {UsecaseGkvValuesFetcher} from '../fetchers/usecase-gkv-values-fetcher.js';
import {UsecaseOverlayFetcher} from '../fetchers/usecase-overlay-fetcher.js';
import {LinkOverlayFetcher} from '../fetchers/link-overlay-fetcher.js';
import {SubgraphOverlayFetcher} from '../fetchers/subgraph-overlay-fetcher.js';
import {SubgraphPropertyDataFetcher} from '../fetchers/subgraph-property-data-fetcher.js';
import {SubgraphSgkvFetcher} from '../fetchers/subgraph-sgkv-fetcher.js';
import {CkvParameterPayloadFetcher} from '../fetchers/ckv-parameter-payload-fetcher.js';
import {CkvOverlayFetcher} from '../fetchers/ckv-overlay-fetcher.js';
import {TkvParameterPayloadFetcher} from '../fetchers/tkv-parameter-payload-fetcher.js';
import {TkvOverlayFetcher} from '../fetchers/tkv-overlay-fetcher.js';
import {SpfModuleOverlayFetcher} from '../fetchers/spf-module-overlay-fetcher.js';
import {SpfModuleParameterDefinitionFetcher} from '../fetchers/definitions/spf-module-definitions/spf-module-parameter-definition-fetcher.js';
import {VcpmOverlayFetcher} from '../fetchers/vcpm-overlay-fetcher.js';
import {DbVcpmQueryService} from './vcpm/db-vcpm-query-service.js';

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
  readonly subgraphQueryService: SubgraphQueryService;
  readonly subgraphPropertyDefQueryService: SubgraphPropertyDefQueryService;
  readonly driverModuleDefinitionQueryService: DriverModuleDefinitionQueryService;
  readonly logQueryService: LogQueryService;
  readonly dataLinkQueryService: DataLinkQueryService;
  readonly controlLinkQueryService: ControlLinkQueryService;
  readonly subsystemQueryService: SubsystemQueryService;
  readonly vcpmQueryService: VcpmQueryService;

  constructor(
    dataSource: DataSource,
    logQueryService: LogQueryService,
    logger?: Logger,
  ) {
    const editActionsQueryService = new EditActionsQueryService(
      dataSource.manager,
    );
    const sessionRepo = new TypeOrmSessionRepository(dataSource.manager);

    // ── Shared fetchers — created once, injected into all services that need them ─
    const usecaseCategoryFetcher = new UseCaseCategoryFetcher(
      dataSource.manager,
      editActionsQueryService,
    );
    const usecaseGkvValuesFetcher = new UsecaseGkvValuesFetcher(
      dataSource.manager,
      editActionsQueryService,
    );
    const subgraphPropertyDataFetcher = new SubgraphPropertyDataFetcher(
      dataSource.manager,
      editActionsQueryService,
    );
    const subgraphSgkvFetcher = new SubgraphSgkvFetcher(
      dataSource.manager,
      editActionsQueryService,
    );
    const subgraphOverlayFetcher = new SubgraphOverlayFetcher(
      dataSource.manager,
      editActionsQueryService,
      subgraphPropertyDataFetcher,
      subgraphSgkvFetcher,
    );
    const usecaseOverlayFetcher = new UsecaseOverlayFetcher(
      dataSource.manager,
      editActionsQueryService,
      usecaseCategoryFetcher,
      usecaseGkvValuesFetcher,
    );
    const linkOverlayFetcher = new LinkOverlayFetcher(
      dataSource.manager,
      editActionsQueryService,
    );
    const ckvPayloadFetcher = new CkvParameterPayloadFetcher(
      dataSource.manager,
      editActionsQueryService,
    );
    const ckvFetcher = new CkvOverlayFetcher(
      dataSource.manager,
      editActionsQueryService,
      ckvPayloadFetcher,
    );
    const tkvPayloadFetcher = new TkvParameterPayloadFetcher(
      dataSource.manager,
      editActionsQueryService,
    );
    const tkvFetcher = new TkvOverlayFetcher(
      dataSource.manager,
      editActionsQueryService,
      tkvPayloadFetcher,
    );
    const spfModuleOverlayFetcher = new SpfModuleOverlayFetcher(
      dataSource.manager,
      editActionsQueryService,
    );
    const spfModuleParamDefinitionFetcher =
      new SpfModuleParameterDefinitionFetcher(
        dataSource.manager,
        editActionsQueryService,
      );

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

    const vcpmOverlayFetcher = new VcpmOverlayFetcher(
      dataSource.manager,
      editActionsQueryService,
    );
    this.vcpmQueryService = new DbVcpmQueryService(
      vcpmOverlayFetcher,
      this.keyValueDefQueryService,
      sessionRepo,
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
      ckvFetcher,
      tkvFetcher,
      spfModuleOverlayFetcher,
      spfModuleParamDefinitionFetcher,
      this.keyValueDefQueryService,
      this.tagDefinitionQueryService,
    );

    this.spfModuleQueryService = new DbSpfModuleQueryService(
      dataSource,
      editActionsQueryService,
      this.spfTuningConfigService,
      this.keyValueDefQueryService,
      sessionRepo,
    );

    this.containerQueryService = new DbContainerQueryService(
      dataSource,
      editActionsQueryService,
      sessionRepo,
    );

    this.subgraphQueryService = new DbSubgraphQueryService(
      sessionRepo,
      this.keyValueDefQueryService,
      subgraphOverlayFetcher,
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
      this.keyValueDefQueryService,
      this.spfModuleQueryService,
      sessionRepo,
      usecaseOverlayFetcher,
      linkOverlayFetcher,
    );

    // Individual link + subsystem query services
    this.dataLinkQueryService = new DbDataLinkQueryService(
      dataSource,
      usecaseOverlayFetcher,
      linkOverlayFetcher,
    );
    this.controlLinkQueryService = new DbControlLinkQueryService(
      dataSource,
      usecaseOverlayFetcher,
      linkOverlayFetcher,
    );
    this.subsystemQueryService = new DbSubsystemQueryService(
      dataSource,
      editActionsQueryService,
    );

    this.logQueryService = logQueryService;
  }
}
