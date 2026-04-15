/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Type} from 'class-transformer';
import {AwspBaseElement} from './base-element.js';
import {AwspConfigElement} from './config-element.js';
import {AwspConfigElementArray} from './config-element-array.js';

/**
 * Represents a structure element with children elements.
 * Extends BaseElement with structure-specific properties.
 */
export class AwspStruct extends AwspBaseElement {
  /** Structure type (required) */
  structureType!: string;

  /** List of child elements (required) */
  @Type(() => AwspBaseElement, {
    discriminator: {
      property: 'elementType',
      subTypes: [
        {value: AwspConfigElement, name: 'ConfigElement'},
        {value: AwspConfigElementArray, name: 'ConfigElementArray'},
        {value: AwspStruct, name: 'Struct'},
      ],
    },
    keepDiscriminatorProperty: true,
  })
  children!: (AwspConfigElement | AwspConfigElementArray | AwspStruct)[];
}
