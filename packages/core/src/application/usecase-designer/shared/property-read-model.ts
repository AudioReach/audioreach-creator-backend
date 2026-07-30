/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {ElementData} from '../../../domain/entities/definitions/common/types/element-data.js';

export interface PropertyDataDto {
  readonly systemId: number;
  readonly propertyId: number;
  readonly propertyName: string;
  readonly elements: ElementData[];
}
