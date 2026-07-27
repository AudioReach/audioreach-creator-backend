/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {PropertyType} from '../../../../../domain/entities/definitions/common/entities/property-definition.js';

export interface PropertyDefinitionSummaryReadModel {
  readonly systemId: number;
  readonly propertyId: number;
  readonly name: string;
  readonly description?: string;
  readonly propertyType: PropertyType;
}

export interface PropertyDefinitionReadModel extends PropertyDefinitionSummaryReadModel {
  readonly maxSize: number;
}
