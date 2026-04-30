/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ModuleQueryService} from './module/module-query-service.js';
import type {UseCaseQueryService} from './usecase/usecase-query-service.js';
import type {ProjectQueryService} from './project/project-query-service.js';
import type {ValidationQueryRepository} from '../ports/persistence/repositories/validation/validation-query.repository.js';

export interface QueryServices {
  readonly modulesQueryService: ModuleQueryService;
  readonly useCaseQueryService: UseCaseQueryService;
  readonly projectQueryService: ProjectQueryService;
  readonly validationQueryService: ValidationQueryRepository;
}
