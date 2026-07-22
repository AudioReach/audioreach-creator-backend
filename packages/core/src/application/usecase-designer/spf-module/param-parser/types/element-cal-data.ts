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

export interface ElementCalDataBase {
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

// ── Element cal-data types (GET output and PUT input) ─────────────────────────

export interface ConfigElementData extends ElementCalDataBase {
  type: typeof PARAMETER_ELEMENT_TYPE.ConfigElement;
  dataType: DataType;
  value: string;
  unit?: string;
  displayType?: DisplayType;
  policy?: string;
  qFormat?: string;
  precision?: number;
  defaultValue?: string;
  min?: number;
  max?: number;
  rangeList?: Array<{name: string; value: string}>;
  dependentOnElements?: Array<{name: string}>;
  displayName?: string;
  linkedByForFormula?: string[];
  defaultDataDepends?: string[];
}

export interface StructData extends ElementCalDataBase {
  type: typeof PARAMETER_ELEMENT_TYPE.Struct;
  structType: string;
  value: ElementCalData[];
}

export interface ElementArrayData extends ElementCalDataBase {
  type: typeof PARAMETER_ELEMENT_TYPE.ElementArray;
  template: ElementCalData[];
  structType?: string;
  value: ElementCalData[];
  length?: number;
  arrayLenFormulaStr?: string;
  copySrcInfoList?: string[];
  displayType?: DisplayType;
  policy?: string;
}

export type ElementCalData = ConfigElementData | StructData | ElementArrayData;
