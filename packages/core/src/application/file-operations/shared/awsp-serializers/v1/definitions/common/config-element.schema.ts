/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {BaseElementSchema} from './base-element.schema.js';

// ─── Nested element schemas (property names match wire format) ────────────────

export const DependentOnElementSchema = z.object({name: z.string()});

export const RangeSchema = z.object({name: z.string(), value: z.string()});

export const DefaultDataDependencySchema = z.object({
  sampleRate: z.string(),
  defaultValue: z.string(),
});

export const GroupItemSchema = z.object({group: z.string()});

export const BitFieldSchema = z.object({
  bitMask: z.string().optional(),
  min: z.string().optional(),
  max: z.string().optional(),
  default: z.string().optional(),
  bitName: z.string().optional(),
  dataFormat: z.string().optional(),
  displayType: z.string().optional(),
  description: z.string().optional(),
  isHide: z.boolean().optional(),
  isReadOnly: z.boolean().optional(),
  rangeList: z.array(RangeSchema).optional().default([]),
  groups: z.array(GroupItemSchema).optional().default([]),
});

export const GroupIndexItemSchema = z.object({index: z.string()});
export const SubGroupItemSchema = z.object({subgroup: z.string()});
export const RtmPlotTypeItemSchema = z.object({plottype: z.string()});
export const ChannelItemSchema = z.object({channel: z.string()});

export const GroupIndexSchema = z.object({
  index: GroupIndexItemSchema.optional(),
  groups: z.array(GroupItemSchema).optional().default([]),
  subGroups: z.array(SubGroupItemSchema).optional().default([]),
  rtmPlotTypes: z.array(RtmPlotTypeItemSchema).optional().default([]),
  channels: z.array(ChannelItemSchema).optional().default([]),
});

// ─── ConfigElement schema ─────────────────────────────────────────────────────

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

  // Extra serializable fields — stored for round-trip fidelity
  /** User-facing default value (optional) */
  userDefaultValue: z.string().optional(),
  /** Hide element from UI (optional) */
  isHide: z.boolean().optional(),
  /** Byte size for RawData elements (optional) */
  byteSize: z.string().optional(),
  /** Raw data size formula (optional) */
  rawDataSizeFormula: z.string().optional(),
  /** Formula string (optional) */
  formula: z.string().optional(),
  /** UI value precision (optional) */
  uiValPrecision: z.number().optional(),
  /** Minimum value (optional) */
  min: z.string().optional(),
  /** Maximum value (optional) */
  max: z.string().optional(),
  /** Elements that this element depends on (optional) */
  dependentOnElements: z.array(DependentOnElementSchema).optional(),
  /** Range list (optional) */
  rangeList: z.array(RangeSchema).optional(),
  /** Bit fields (optional) */
  bitFields: z.array(BitFieldSchema).optional(),
  /** Group index list (optional) */
  groupIndex: z.array(GroupIndexSchema).optional(),
  /** Default data dependencies (optional) */
  defaultDataDependencies: z.array(DefaultDataDependencySchema).optional(),
});

// Export inferred types
export type DependentOnElement = z.infer<typeof DependentOnElementSchema>;
export type Range = z.infer<typeof RangeSchema>;
export type DefaultDataDependency = z.infer<typeof DefaultDataDependencySchema>;
export type GroupItem = z.infer<typeof GroupItemSchema>;
export type BitField = z.infer<typeof BitFieldSchema>;
export type GroupIndexItem = z.infer<typeof GroupIndexItemSchema>;
export type SubGroupItem = z.infer<typeof SubGroupItemSchema>;
export type RtmPlotTypeItem = z.infer<typeof RtmPlotTypeItemSchema>;
export type ChannelItem = z.infer<typeof ChannelItemSchema>;
export type GroupIndex = z.infer<typeof GroupIndexSchema>;
