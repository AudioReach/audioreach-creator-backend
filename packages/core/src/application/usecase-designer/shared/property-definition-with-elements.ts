/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {PropertyDefinitionReadModel} from '../../ports/persistence/query-services/property-definition/property-definition-read-model.js';

export interface PropertyDefinitionWithElements extends PropertyDefinitionReadModel {
  readonly elementsStructure: string;
}
