/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import type {
  PropertyDefinitionSummaryReadModel,
  PropertyDefinitionReadModel,
} from '../../../ports/persistence/query-services/property-definition/property-definition-read-model.js';

export const ContainerPropertyDefinitionSummaryDtoSchema = z
  .object({
    systemId: z.string().describe('System identifier'),
    propertyId: z.number().int().describe('Property identifier'),
    name: z.string().describe('Property name'),
    description: z.string().describe('Property description'),
    type: z.string().describe('Property type'),
  })
  .describe('Container property definition summary');

export type ContainerPropertyDefinitionSummaryDto = z.infer<
  typeof ContainerPropertyDefinitionSummaryDtoSchema
>;

export const ContainerPropertyDefinitionDtoSchema =
  ContainerPropertyDefinitionSummaryDtoSchema.describe(
    'Container property definition',
  );

export type ContainerPropertyDefinitionDto = z.infer<
  typeof ContainerPropertyDefinitionDtoSchema
>;

function mapPropertyDefinitionFields(
  m: PropertyDefinitionSummaryReadModel,
): ContainerPropertyDefinitionSummaryDto {
  return {
    systemId: String(m.systemId),
    propertyId: m.propertyId,
    name: m.name,
    description: m.description ?? '',
    type: m.propertyType,
  };
}

export const mapContainerPropertyDefinitionSummary =
  mapPropertyDefinitionFields;

export function mapContainerPropertyDefinition(
  m: PropertyDefinitionReadModel,
): ContainerPropertyDefinitionDto {
  return mapPropertyDefinitionFields(m);
}
