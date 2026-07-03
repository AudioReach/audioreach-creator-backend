/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
/**
 * Full projection of the SpfModuleParameterDefinition domain entity.
 *
 * summary=true     → systemId, paramId, name, description, pidType
 * fullDetails=true → all fields
 */
export interface ParameterDefinitionReadModel {
  readonly systemId: number;
  readonly paramId: number;
  readonly name?: string;
  readonly description?: string;
  readonly pidType: string;

  // present when fullDetails=true
  readonly maxSize?: number;
  readonly elementsStructure?: string;
  readonly isPersistent?: boolean;
  readonly isReadOnly: boolean;
  readonly toolPolicies?: string;
}

/**
 * Unified parameter definition summary read model used by all module families
 * (SPF, driver, ...). Extends the SPF-originated full projection
 * (ParameterDefinitionReadModel) with the two summary-only fields it lacks —
 * isHidden and deprecated. Driver rows don't populate maxSize/
 * elementsStructure/isPersistent (SPF-only, optional), so this stays valid
 * for driver's summary path without forcing it to implement fields it has
 * no backing column for.
 */
export interface ParameterDefinitionSummaryReadModel extends ParameterDefinitionReadModel {
  readonly isHidden: boolean;
  readonly deprecated?: boolean;
  readonly toolPolicies: string; // stored form; mapped to ToolPolicy[] at the DTO boundary
}
