/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {
  ParameterElementDtoSchema,
  ParameterElementSummaryDtoSchema,
} from './element-dto.js';

export const ParameterDtoSchema = z.object({
  systemId: z.string().describe('System identifier'),
  parameterId: z.string().describe('Parameter ID (PID)'),
  name: z.string().describe('Parameter name'),
  description: z.string().optional().describe('Parameter description'),
  isHidden: z.boolean().optional().describe('When true, hidden from the UI'),
  isReadOnly: z
    .boolean()
    .optional()
    .describe('When true, cannot be modified by the user'),
  deprecated: z.boolean().optional().describe('Deprecated parameter'),
  isNeuralNet: z.boolean().optional().describe('Neural network parameter'),
  isOffloaded: z
    .boolean()
    .optional()
    .describe('Processing offloaded to a separate processor or accelerator'),
  pidType: z
    .string()
    .optional()
    .describe(
      'PID sharing scope: NONE (not shared), SHARED (across module instances), GLOBAL_SHARED (across all modules)',
    ),
  elements: z
    .array(ParameterElementDtoSchema)
    .describe('Calibration/tag elements'),
});

export type ParameterDto = z.infer<typeof ParameterDtoSchema>;

export const ParameterSummaryDtoSchema = z.object({
  systemId: z.string().describe('System identifier (parameter system ID)'),
  name: z.string().describe('Parameter name'),
  elements: z
    .array(ParameterElementSummaryDtoSchema)
    .describe('Elements to write'),
});
export type ParameterSummaryDto = z.infer<typeof ParameterSummaryDtoSchema>;

export const PropertySummaryDtoSchema = ParameterSummaryDtoSchema;
// eslint-disable-next-line sonarjs/redundant-type-aliases -- property-context alias for API readability
export type PropertySummaryDto = ParameterSummaryDto;
