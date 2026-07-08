/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {DataType} from '../../../../file-operations/shared/awsp-serializers/v1/definitions/common/type/data-type.js';
import {
  PARAMETER_ELEMENT_TYPE,
  type DisplayType,
} from './element-definition.js';

// ── Shared base fields present on every element variant ───────────────────────

export interface ParsedElementBase {
  name: string;
  description?: string;
  group?: string;
  subgroup?: string;
  isReadOnly: boolean;
  alignment?: number;
  channel?: number;
  groupSet?: number;
  rtmPlotType?: string;
  copySrc?: string;
}

// ── Schema types (no value — used in array template descriptors) ──────────────

export interface ConfigElementSchema extends ParsedElementBase {
  type: typeof PARAMETER_ELEMENT_TYPE.ConfigElement;
  dataType: DataType;
  unit?: string;
  displayType?: DisplayType;
  policy?: string;
  qFormat?: string;
  precision?: number;
  defaultValue?: string;
  min?: string;
  max?: string;
  rangeList?: Array<{name: string; value: string}>;
  dependentOnElements?: Array<{name: string}>;
  displayName?: string;
  linkedByForFormula?: string[];
  defaultDataDepends?: string[];
}

export interface StructSchema extends ParsedElementBase {
  type: typeof PARAMETER_ELEMENT_TYPE.Struct;
  structureType: string;
  children: ElementSchema[];
}

export interface ElementArraySchema extends ParsedElementBase {
  type: typeof PARAMETER_ELEMENT_TYPE.ElementArray;
  template: ConfigElementSchema;
  length?: number;
  arrayLenFormulaStr?: string;
  copySrcInfoList?: string[];
  displayType?: DisplayType;
  policy?: string;
}

export interface StructArraySchema extends ParsedElementBase {
  type: typeof PARAMETER_ELEMENT_TYPE.StructArray;
  structureType: string;
  template: StructSchema;
  length?: number;
  arrayLenFormulaStr?: string;
  copySrcInfoList?: string[];
  displayType?: DisplayType;
  policy?: string;
}

export type ElementSchema =
  | ConfigElementSchema
  | StructSchema
  | ElementArraySchema
  | StructArraySchema;

// ── Data types (value required — output of parseParameterData) ────────────────

export interface ConfigElementData extends ConfigElementSchema {
  value: string;
}

export interface StructData extends ParsedElementBase {
  type: typeof PARAMETER_ELEMENT_TYPE.Struct;
  structureType: string;
  value: ParsedElementData[];
}

export interface ElementArrayData extends ParsedElementBase {
  type: typeof PARAMETER_ELEMENT_TYPE.ElementArray;
  template: ConfigElementSchema;
  value: ParsedElementData[];
  length: number;
  arrayLenFormulaStr?: string;
  copySrcInfoList?: string[];
  displayType?: DisplayType;
  policy?: string;
}

export interface StructArrayData extends ParsedElementBase {
  type: typeof PARAMETER_ELEMENT_TYPE.StructArray;
  structureType: string;
  template: StructSchema;
  value: ParsedElementData[];
  length: number;
  arrayLenFormulaStr?: string;
  copySrcInfoList?: string[];
  displayType?: DisplayType;
  policy?: string;
}

export type ParsedElementData =
  | ConfigElementData
  | StructData
  | ElementArrayData
  | StructArrayData;
