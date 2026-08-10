/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {PropertyDtoSchema} from '../../../../shared/dto/property-dto.js';
import type {PropertyDto} from '../../../../shared/dto/property-dto.js';

export const SubgraphPropertiesDtoSchema = z
  .object({
    properties: z
      .array(PropertyDtoSchema)
      .describe('Array of subgraph properties'),
  })
  .describe('Subgraph property data');

export type SubgraphPropertiesDto = z.infer<typeof SubgraphPropertiesDtoSchema>;

export function mapSubgraphProperties(
  properties: PropertyDto[],
): SubgraphPropertiesDto {
  return {properties};
}
