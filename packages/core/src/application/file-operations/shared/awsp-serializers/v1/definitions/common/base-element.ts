/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseDefinition} from './base-definition.js';

/**
 * Represents a base element with identification and advanced configuration.
 */
export abstract class AwspBaseElement extends BaseDefinition {
  /** Element type (e.g., ConfigElement, ElementArray, Struct, StructArray) (required) */
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

  /**
   * Helper method for subclasses to serialize base element fields
   * @returns Base element fields as plain object
   */
  protected serializeBaseElementFields(): Record<string, unknown> {
    return {
      elementType: this.elementType,
      name: this.name,
      description: this.description,
      channel: this.channel,
      groupSet: this.groupSet,
      alignment: this.alignment,
      rtmPlotType: this.rtmPlotType,
      group: this.group,
      subGroup: this.subGroup,
      copySrc: this.copySrc,
    };
  }
}
