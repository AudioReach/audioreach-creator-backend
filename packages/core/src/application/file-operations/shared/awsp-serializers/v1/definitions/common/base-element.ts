/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Represents a base element with identification and advanced configuration.
 */
export abstract class BaseElement {
  /** Element type (e.g., ConfigElement, ConfigElementArray, Struct, StructArray) (required) */
  elementType!: string;

  /** Name of the element (required) */
  name!: string;

  /** Description of the element (optional) */
  description?: string;

  /** Channel identifier (optional) */
  channel?: number;

  /** Group set identifier (optional) */
  groupSet?: number;

  /** Alignment value (optional) */
  alignment?: number;

  /** RTM plot type (optional) */
  rtmPlotType?: string;

  /** Group name (optional) */
  group?: string;

  /** Sub-group name (optional) */
  subGroup?: string;

  /** Copy source reference (optional) */
  copySrc?: string;
}
