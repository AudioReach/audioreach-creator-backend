/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ParameterDefinitionQueryService} from './parameter-definition/parameter-definition-query-service.js';

export interface SpfModuleDefinitionQueryService {
  readonly parameterDefinitionQueryService: ParameterDefinitionQueryService;
}
