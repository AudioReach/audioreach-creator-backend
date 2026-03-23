/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {ALLOWED_VALUES_ITEM_TYPE} from './types/allowed-values-item-type.js';
import type {AllowedValuesItemType} from './types/allowed-values-item-type.js';
import {NameValuePairDto} from './name-value-pair.dto.js';

/**
 * Bit field definition for a single bit or group of bits within a parameter.
 * Used when displayType is BitField to describe the meaning of individual bit ranges.
 *
 * ## How Bit Fields Work:
 *
 * Bit fields allow a single configuration parameter to encode multiple boolean or
 * enumerated values by using different bits within the parameter's value.
 *
 * ### Bit Mask Calculation:
 * - The `bitMask` identifies which bit(s) this field controls (e.g., 0x1 = bit 0, 0x2 = bit 1, 0x4 = bit 2)
 * - When a bit field is set to a value, its contribution to the parent config element is:
 *   **value × bitMask** or equivalently **value × 2^(bit_position)**
 *
 * ### Example:
 *
 * Given a config element "mode" with type uint16 and default value 0x0000:
 *
 * ```
 * BITFIELD 1: detectionMode
 *   - bitMask: 0x1 (controls bit 0)
 *   - allowedValues: [Disabled=0x0, Enabled=0x1]
 *   - If Enabled (0x1): contributes 0x1 × 0x1 = 0x1 to config value
 *
 * BITFIELD 2: verificationMode
 *   - bitMask: 0x2 (controls bit 1)
 *   - allowedValues: [Disabled=0x0, Enabled=0x1]
 *   - If Enabled (0x1): contributes 0x1 × 0x2 = 0x2 to config value
 * ```
 *
 * **Final config element value calculation:**
 * - Both disabled: 0x0 + 0x0 = 0x0000
 * - Only detection enabled: 0x1 + 0x0 = 0x0001
 * - Only verification enabled: 0x0 + 0x2 = 0x0002
 * - Both enabled: 0x1 + 0x2 = 0x0003
 *
 * ### Bit Layout Visualization:
 * ```
 * Bit:     15 14 13 12 11 10  9  8  7  6  5  4  3  2  1  0
 * Field:   [  ...unused...                    ][V][D]
 *                                               |  |
 *                                               |  +-- detectionMode (bit 0, mask 0x1)
 *                                               +----- verificationMode (bit 1, mask 0x2)
 * ```
 *
 * ### UI Behavior:
 * - The UI should render each bit field as a separate control (dropdown, checkbox, etc.)
 * - When the user changes a bit field value, recalculate the parent config element value
 *   by summing all bit field contributions
 * - The parent config element displays the combined value (e.g., 0x0003)
 */
export class BitFieldDto {
  @ApiProperty({
    description: 'Discriminator identifying this entry as a bit field item.',
    default: ALLOWED_VALUES_ITEM_TYPE.BitField,
  })
  readonly type: AllowedValuesItemType = ALLOWED_VALUES_ITEM_TYPE.BitField;

  @ApiProperty({description: 'Bit mask value'})
  bitMask!: string;

  @ApiProperty({description: 'Bit field name'})
  name!: string;

  @ApiProperty({description: 'Description of the bit field', required: false})
  description?: string;

  @ApiProperty({
    description:
      'Enumerated set of allowed values the client may choose from for this bit field. ' +
      'Example: [{name: "Enable", value: "1"}, {name: "Disable", value: "0"}]',
    type: [NameValuePairDto],
  })
  allowedValues!: NameValuePairDto[];
}
