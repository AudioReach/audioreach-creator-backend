/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {ElementData} from '../../../../domain/entities/definitions/common/types/element-data.js';

export interface PropertyReadModel {
  readonly systemId: number;
  readonly propertyId: number;
  readonly propertyName: string;
  readonly hasDefinition: boolean;
  readonly elements: ElementData[];
}
