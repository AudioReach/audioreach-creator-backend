/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {
  DataLinkDtoSchema,
  ControlLinkDtoSchema,
} from '../../usecase/dto/component-collection-dto.js';
import {UseCaseDtoSchema} from '../../usecase/dto/usecase-dto.js';

export const SubgraphPairDtoSchema = z
  .object({
    sourceSubgraphSystemId: z.string().describe('Source subgraph system ID'),
    destinationSubgraphSystemId: z
      .string()
      .describe('Destination subgraph system ID'),
    dataLinks: z
      .array(DataLinkDtoSchema)
      .describe('Data links between the subgraph pair'),
    controlLinks: z
      .array(ControlLinkDtoSchema)
      .describe('Control links between the subgraph pair'),
  })
  .describe('Subgraph pair');

export type SubgraphPairDto = z.infer<typeof SubgraphPairDtoSchema>;

export const DataLinkWithUsecasesDtoSchema = z
  .object({
    link: DataLinkDtoSchema.describe('The data link'),
    usecases: z
      .array(UseCaseDtoSchema)
      .describe('Usecases that this data link is part of'),
  })
  .describe('Data link with usecases');

export type DataLinkWithUsecasesDto = z.infer<
  typeof DataLinkWithUsecasesDtoSchema
>;

export const ControlLinkWithUsecasesDtoSchema = z
  .object({
    link: ControlLinkDtoSchema.describe('The control link'),
    usecases: z
      .array(UseCaseDtoSchema)
      .describe('Usecases that this control link is part of'),
  })
  .describe('Control link with usecases');

export type ControlLinkWithUsecasesDto = z.infer<
  typeof ControlLinkWithUsecasesDtoSchema
>;
