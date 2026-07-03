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
