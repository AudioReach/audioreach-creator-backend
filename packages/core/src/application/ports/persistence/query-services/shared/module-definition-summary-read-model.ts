/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Fields shared by every module-family's parameter-definition summary read
 * model (SPF, driver, ...).
 */
export interface BaseParameterDefinitionSummaryReadModel {
  readonly systemId: number;
  readonly paramId: number;
  readonly name?: string;
  readonly description?: string;
  readonly isReadOnly: boolean;
  readonly deprecated?: boolean;
}

/**
 * Unified parameter definition summary read model used by all module families
 * (SPF, driver, ...). Previously each family had its own identical extension
 * of BaseParameterDefinitionSummaryReadModel, but they were consolidated since
 * they all had the same fields.
 */
export interface ParameterDefinitionSummaryReadModel extends BaseParameterDefinitionSummaryReadModel {
  readonly isHidden: boolean;
  readonly toolPolicies: string; // stored form; mapped to ToolPolicy[] at the DTO boundary
  readonly pidType: string;
}

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
