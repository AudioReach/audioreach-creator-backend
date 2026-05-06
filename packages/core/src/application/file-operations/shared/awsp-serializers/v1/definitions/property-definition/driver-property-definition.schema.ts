/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {BasePropertyDefinitionSchema} from './base-property-definition.schema.js';

/**
 * Zod schema for DriverPropertyDefinition
 * Uses base property schema without extensions
 */
export const DriverPropertyDefinitionSchema = BasePropertyDefinitionSchema;

export type DriverPropertyDefinition = z.infer<
  typeof DriverPropertyDefinitionSchema
>;
