/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ReadModelBase} from '../../../../../shared/read-model-base.js';

export interface ParameterDefinitionReadModel extends ReadModelBase {
  parameterId: number; // business key — maps from SpfModuleParameterDefinitionRow.paramId
  name: string;
  description?: string;
  paramStructure: string; // JSON string — maps from SpfModuleParameterDefinitionRow.elementsStructure
  isReadOnly: boolean;
  pidType: string;
}
