/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {ALLOWED_VALUES_ITEM_TYPE} from './types/allowed-values-item-type.js';
import type {AllowedValuesItemType} from './types/allowed-values-item-type.js';

/**
 * Represents an allowed value option for configuration elements.
 * Each entry maps a value to a human-readable label, used for dropdowns,
 * enumerations, and other discrete value selections.
 */
export class NameValuePairDto {
  @ApiProperty({
    description:
      'Discriminator identifying this entry as an allowed value option.',
    default: ALLOWED_VALUES_ITEM_TYPE.NameValuePair,
  })
  readonly type: AllowedValuesItemType = ALLOWED_VALUES_ITEM_TYPE.NameValuePair;

  @ApiProperty({description: 'Human-readable name for this allowed value'})
  name!: string;

  @ApiProperty({description: 'The actual value'})
  value!: string;
}
