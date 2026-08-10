/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import type {
  SubgraphPropertyDefinitionSummaryReadModel,
  SubgraphPropertyDefinitionReadModel,
} from '../../../ports/persistence/query-services/subgraph-property-definition/subgraph-property-definition-read-model.js';

export const SubgraphPropertyDefinitionSummaryDtoSchema = z
  .object({
    systemId: z.string().describe('System identifier'),
    propertyId: z.number().int().describe('Property identifier'),
    name: z.string().describe('Property name'),
    description: z.string().describe('Property description'),
    type: z.string().describe('Property type'),
    isVoice: z.boolean().describe('Indicates if the property is voice'),
  })
  .describe('Subgraph property definition summary');

export type SubgraphPropertyDefinitionSummaryDto = z.infer<
  typeof SubgraphPropertyDefinitionSummaryDtoSchema
>;

export const SubgraphPropertyDefinitionDtoSchema =
  SubgraphPropertyDefinitionSummaryDtoSchema.describe(
    'Subgraph property definition',
  );

export type SubgraphPropertyDefinitionDto = z.infer<
  typeof SubgraphPropertyDefinitionDtoSchema
>;

function mapSubgraphPropertyDefinitionFields(
  m: SubgraphPropertyDefinitionSummaryReadModel,
): SubgraphPropertyDefinitionSummaryDto {
  return {
    systemId: String(m.systemId),
    propertyId: m.propertyId,
    name: m.name,
    description: m.description ?? '',
    type: m.propertyType,
    isVoice: m.isVoice,
  };
}

export const mapSubgraphPropertyDefinitionSummary =
  mapSubgraphPropertyDefinitionFields;

export function mapSubgraphPropertyDefinition(
  m: SubgraphPropertyDefinitionReadModel,
): SubgraphPropertyDefinitionDto {
  return mapSubgraphPropertyDefinitionFields(m);
}
