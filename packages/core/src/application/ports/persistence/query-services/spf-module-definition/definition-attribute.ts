/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Declares which child tables of the SpfModuleDefinition aggregate to load.
 *
 * The identity root row (name, moduleId) is always loaded.
 * Corresponding read model fields are null when the flag is false.
 *
 *   includeSummary:     dataPortCapabilities + controlPortCapabilities
 *   includeFullDetails: parameterDefinitions + propertyDefinitions + moduleAttributes
 */
export interface DefinitionIncludes {
  includeSummary: boolean;
  includeFullDetails: boolean;
}
