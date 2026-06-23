/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {BaseElementSchema} from '../../common/base-element.schema.js';
import {HexIdSchema} from '../../common/hex-id.schema.js';

/**
 * Schema for tool policy values
 */
const AwspToolPolicySchema = z.enum([
  'Calibration',
  'Rtc',
  'Rtm',
  'RtcReadonly',
]);

/**
 * Schema for PID type values
 */
const AwspPidTypeSchema = z.enum(['None', 'Shared', 'GlobalShared']);

/**
 * Schema for definition elements (union type)
 * Uses BaseElementSchema which allows polymorphic element types via passthrough
 */
const AwspDefinitionElementSchema = BaseElementSchema;

/**
 * Schema for AWSP parameter definition.
 * Validates parameter metadata including ID, name, tool policies, and elements.
 * toolPolicies accepts both the object form [{value: 'Calibration'}] used in
 * JSON workspace files and the plain string form ['Calibration'] used in
 * class serialization / round-trip.
 */
export const AwspParamDefinitionSchema = z.object({
  id: HexIdSchema,
  name: z.string(),
  toolPolicies: z
    .preprocess(
      arr =>
        Array.isArray(arr)
          ? arr.map(item =>
              typeof item === 'string' ? item : (item as {value: string}).value,
            )
          : arr,
      z.array(AwspToolPolicySchema),
    )
    .optional()
    .default([]),
  pidType: AwspPidTypeSchema,
  elements: z.array(AwspDefinitionElementSchema).optional(),
  description: z.string().optional(),
  maxSize: z.number().optional(),
  isNeuralNet: z.boolean().optional(),
  isOffloaded: z.boolean().optional(),
  isHwAccel: z.boolean().optional(),
  isHwAccelEnable: z.boolean().optional(),
  isHidden: z.boolean().optional(),
  isReadOnly: z.boolean().optional(),
  deprecated: z.boolean().optional(),
});

export type AwspParamDefinition = z.infer<typeof AwspParamDefinitionSchema>;
