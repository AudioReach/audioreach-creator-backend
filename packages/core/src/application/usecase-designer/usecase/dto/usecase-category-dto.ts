/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {UseCaseDtoSchema} from './usecase-dto.js';

const UsecaseCategorySummaryDtoSchema = z.object({
  systemId: z
    .string()
    .describe('Unique system identifier for the usecase category'),
  name: z.string().describe('Name of the usecase category'),
});

export const UsecaseCategoryDtoSchema = UsecaseCategorySummaryDtoSchema.extend({
  usecases: z
    .array(UseCaseDtoSchema)
    .describe('Array of usecases associated with this category'),
}).describe('Usecase category');

export type UsecaseCategoryDto = z.infer<typeof UsecaseCategoryDtoSchema>;

export const DeleteUsecaseCategoryDtoSchema = z
  .object({
    systemId: z.string().describe('System ID of the deleted usecase category'),
  })
  .describe('Deleted usecase category');

export type DeleteUsecaseCategoryDto = z.infer<
  typeof DeleteUsecaseCategoryDtoSchema
>;
