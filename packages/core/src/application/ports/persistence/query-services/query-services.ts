/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {ModuleQueryService} from './module/module-query-service.js';
import type {UseCaseQueryService} from './usecase/usecase-query-service.js';
import type {ProjectQueryService} from './project/project-query-service.js';
import type {ValidationQueryRepository} from '../repositories/validation/validation-query.repository.js';
import type {BulkReadQueryService} from './bulk-read/bulk-read-query-service.js';
import type {SpfModuleQueryService} from './spf-module/spf-module-query-service.js';
import type {SpfModuleDefinitionQueryService} from './spf-module-definition/spf-module-definition-query-service.js';
import type {SpfTuningConfigService} from './spf-module/tuning/spf-tuning-config-service.js';
import type {KeyValueDefQueryService} from './key-value/key-value-definition-query-service.js';
import type {ContainerQueryService} from './container/container-query-service.js';
import type {DriverModuleDefinitionQueryService} from './driver-module-definition/driver-module-definition-query-service.js';
import type {TagDefinitionQueryService} from './tag-definition/tag-definition-query-service.js';

export interface QueryServices {
  readonly modulesQueryService: ModuleQueryService;
  readonly useCaseQueryService: UseCaseQueryService;
  readonly projectQueryService: ProjectQueryService;
  readonly validationQueryService: ValidationQueryRepository;
  /** Repository for reading all entities needed for file download. */
  readonly bulkReadQueryService: BulkReadQueryService;
  readonly spfModuleQueryService: SpfModuleQueryService;
  readonly spfModuleDefinitionQueryService: SpfModuleDefinitionQueryService;
  readonly spfTuningConfigService: SpfTuningConfigService;
  readonly keyValueDefQueryService: KeyValueDefQueryService;
  readonly tagDefinitionQueryService: TagDefinitionQueryService;
  readonly containerQueryService: ContainerQueryService;
  readonly driverModuleDefinitionQueryService: DriverModuleDefinitionQueryService;
}
