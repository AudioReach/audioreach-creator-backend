/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {PropertyDtoSchema} from '../../../../shared/dto/property-dto.js';
import type {PropertyDto} from '../../../../shared/dto/property-dto.js';

export const ControlLinkPropertiesDtoSchema = z
  .object({
    properties: z
      .array(PropertyDtoSchema)
      .describe('Array of control link properties'),
  })
  .describe('Control link property data');

export type ControlLinkPropertiesDto = z.infer<
  typeof ControlLinkPropertiesDtoSchema
>;

export function mapControlLinkProperties(
  properties: PropertyDto[],
): ControlLinkPropertiesDto {
  return {properties};
}
