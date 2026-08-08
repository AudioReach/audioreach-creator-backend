/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {DataType} from '../../../../../application/file-operations/shared/awsp-serializers/v1/definitions/common/type/data-type.js';
import {
  PARAMETER_ELEMENT_TYPE,
  type DisplayType,
} from '../../../../../application/usecase-designer/shared/element-definition.js';

// ── Shared base fields present on every element variant ───────────────────────

export interface ElementDataBase {
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

// ── Element data types (GET output and PUT input) ─────────────────────────────

export interface ConfigElementData extends ElementDataBase {
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

export interface StructData extends ElementDataBase {
  type: typeof PARAMETER_ELEMENT_TYPE.Struct;
  structType: string;
  value: ElementData[];
}

export interface ElementArrayData extends ElementDataBase {
  type: typeof PARAMETER_ELEMENT_TYPE.ElementArray;
  template: ElementData[];
  structType?: string;
  value: ElementData[];
  length?: number;
  arrayLenFormulaStr?: string;
  copySrcInfoList?: string[];
  displayType?: DisplayType;
  policy?: string;
}

export type ElementData = ConfigElementData | StructData | ElementArrayData;
