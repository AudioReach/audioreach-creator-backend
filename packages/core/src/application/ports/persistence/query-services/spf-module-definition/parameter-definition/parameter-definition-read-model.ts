/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface ParameterDefinitionReadModel {
  systemId: number;
  parameterId: number;
  name: string;
  description?: string;
  elementsStructure: string; // JSON string — maps from SpfModuleParameterDefinitionRow.elementsStructure
  isReadOnly: boolean;
  pidType: string;
}
