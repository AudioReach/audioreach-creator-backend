/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ParameterDefinitionSummaryReadModel} from './parameter-definition-read-model.js';

/**
 * Fields shared by every module-family's module-definition summary read
 * model (SPF, driver, ...). All families now use the unified
 * ParameterDefinitionSummaryReadModel for their parameter definitions.
 */
export interface BaseModuleDefinitionSummaryReadModel {
  readonly systemId: number;
  readonly moduleId: number;
  readonly name: string;
  readonly displayName?: string;
  readonly description?: string;
  readonly parameterDefinitions: ParameterDefinitionSummaryReadModel[];
  readonly deprecated?: boolean;
}
