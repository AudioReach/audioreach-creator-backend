/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {
  mapElements,
  ParameterElementDtoSchema,
} from '../../application/usecase-designer/spf-module/dto/element-dto.js';
import type {PropertyDataDto} from '../../application/usecase-designer/shared/property-read-model.js';

export const PropertyDtoSchema = z
  .object({
    systemId: z.string().describe('System ID'),
    naturalId: z.number().int().describe('Property ID'),
    propertyName: z.string().describe('Property name'),
    hasDefinition: z.boolean().describe('Has definition or not'),
    elements: z
      .array(ParameterElementDtoSchema)
      .optional()
      .describe(
        'Array of calibration elements for this property. Can contain ConfigElement, ElementTemplateArray, or Struct entries.',
      ),
  })
  .meta({id: 'PropertyDto'});

export type PropertyDto = z.infer<typeof PropertyDtoSchema>;

export function mapPropertyToDto(model: PropertyDataDto): PropertyDto {
  return {
    systemId: String(model.systemId),
    naturalId: model.naturalId,
    propertyName: model.propertyName,
    hasDefinition: true,
    elements: mapElements(model.elements),
  };
}
