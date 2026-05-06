/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {BaseElementSchema} from './base-element.schema.js';

/**
 * Schema for configuration element validation.
 * Extends BaseElementSchema with config-specific fields.
 */
export const ConfigElementSchema = BaseElementSchema.extend({
  /** Data type of the configuration element (required) */
  dataType: z.string(),

  /** Default value for the configuration element (required) */
  defaultValue: z.string(),

  /** Display type for the configuration element (optional) */
  displayType: z.string().optional(),

  /** Policy for the configuration element (optional) */
  policy: z.string().optional(),

  /** Indicates if the element is read-only (optional) */
  isReadOnly: z.boolean().optional(),

  /** Display name for the configuration element (optional) */
  displayName: z.string().optional(),

  /** Unit string for the configuration element (optional) */
  unitStr: z.string().optional(),

  /** Q format string (optional) */
  qFormat: z.string().optional(),

  /** Precision value (optional) */
  precision: z.number().optional(),

  /** List of elements linked by formula (optional) */
  linkedByForFormula: z.array(z.string()).optional(),

  /** List of default data dependencies (optional) */
  defaultDataDepends: z.array(z.string()).optional(),
});
