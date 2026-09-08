/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {KeyValueInfoDtoSchema, UseCaseDtoSchema} from '../dto/usecase-dto.js';

/** Explicit subsystem information returned with a filtered GKV group. */
export const SubsystemReferenceDtoSchema = z.object({
  subsystemNaturalId: z.number().int().describe('Subsystem natural identifier'),
  name: z.string().describe('Subsystem name'),
});

export type SubsystemReferenceDto = z.infer<typeof SubsystemReferenceDtoSchema>;

/** Filtered GKV values and the subsystems represented by removed keys. */
export const SubsystemFilteredKvDtoSchema = z.object({
  keyValuePairs: z
    .array(KeyValueInfoDtoSchema)
    .describe('Collection of key-value pairs after subsystem filtering'),
  subsystems: z
    .array(SubsystemReferenceDtoSchema)
    .describe('Subsystems represented by the filtered key definitions'),
});

export type SubsystemFilteredKvDto = z.infer<
  typeof SubsystemFilteredKvDtoSchema
>;

/** Public response for one group of usecases sharing filtered GKV data. */
export const SubsystemFilteredUsecasesResponseDtoSchema = z.object({
  filteredKv: SubsystemFilteredKvDtoSchema,
  usecases: z
    .array(UseCaseDtoSchema)
    .describe('Usecases that share this filtered GKV result'),
});

export type SubsystemFilteredUsecasesResponseDto = z.infer<
  typeof SubsystemFilteredUsecasesResponseDtoSchema
>;
