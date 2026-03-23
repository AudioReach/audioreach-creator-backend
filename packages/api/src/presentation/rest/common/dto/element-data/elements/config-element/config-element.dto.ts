/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

import {NameValuePairDto} from './name-value-pair.dto.js';
import {BitFieldDto} from './bit-field.dto.js';
import type {BaseElement} from '../../types/base-element.type.js';
import {ELEMENT_TYPE, type ElementType} from '../../types/element-type.js';
import {DISPLAY_TYPE, type DisplayType} from './types/display-type.js';
import {ELEMENT_POLICY, type ElementPolicy} from './types/element-policy.js';

/**
 * Configuration element DTO for calibration data.
 * Represents a single scalar or enumerated parameter that can be read or written.
 * Rendered in the UI as a slider, text box, dropdown, checkbox, or other control
 * depending on the displayType field.
 */
export class ConfigElementDto implements BaseElement {
  // ── Mandatory fields ──────────────────────────────────────────────────────

  @ApiProperty({
    description: 'Discriminator field identifying this as a ConfigElement.',
    default: ELEMENT_TYPE.ConfigElement,
  })
  readonly type: ElementType = ELEMENT_TYPE.ConfigElement;

  @ApiProperty({
    description:
      'Unique name of the element within its parent scope. ' +
      'Used as the key when reading or writing the parameter value.',
  })
  name!: string;

  @ApiProperty({
    description: 'Current value of the element as a string.',
    type: 'string',
  })
  value!: string;

  // ── Optional fields ───────────────────────────────────────────────────────

  @ApiProperty({
    description:
      'Human-readable description of what this element controls or represents. ' +
      'Displayed as a tooltip or label in the UI.',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description:
      'Logical group this element belongs to. ' +
      'Used to visually cluster related elements together in the UI.',
    required: false,
  })
  group?: string;

  @ApiProperty({
    description:
      'Optional sub-group within the group for finer-grained UI organization.',
    required: false,
  })
  subgroup?: string;

  @ApiProperty({
    description:
      'Unit of measurement for the value (e.g. dB, Hz, ms). ' +
      'Displayed alongside the value in the UI for context.',
    required: false,
  })
  unit?: string;

  @ApiProperty({
    description:
      'When true, the element value cannot be modified by the user. ' +
      'The UI should render this element in a read-only state.',
  })
  isReadOnly!: boolean;

  @ApiProperty({
    description:
      'Hint for how the element should be rendered in the UI. ' +
      'For example: Slider for continuous ranges, DropDown for discrete valid values, ' +
      'CheckBox for boolean flags, TextBox for free-form numeric entry.',
    enum: DISPLAY_TYPE,
    required: false,
  })
  displayType?: DisplayType;

  @ApiProperty({
    description:
      'Visibility and access-control policy for this element. ' +
      'Hidden elements are not shown in the UI. ' +
      'Basic elements are shown in the default view. ' +
      'Advanced elements are shown only in the advanced/expert view.',
    enum: ELEMENT_POLICY,
    required: false,
  })
  policy?: ElementPolicy;

  @ApiProperty({
    description:
      'Q-format notation string indicating the fixed-point scaling of the value ' +
      '(e.g. Q15 means the value is scaled by 2^15). ' +
      'Used when displayType is QFormattedValue.',
    required: false,
  })
  qFormat?: string;

  @ApiProperty({
    description:
      'Number of decimal places to display when rendering the value in the UI. ' +
      'Applies to floating-point and Q-formatted values.',
    minimum: 0,
    required: false,
  })
  precision?: number;

  @ApiProperty({
    description:
      'Minimum allowed value for this element. ' +
      'The UI should prevent the user from entering a value below this bound. ' +
      'Not applicable when dataType is RawData.',
    required: false,
  })
  min?: number;

  @ApiProperty({
    description:
      'Maximum allowed value for this element. ' +
      'The UI should prevent the user from entering a value above this bound. ' +
      'Not applicable when dataType is RawData.',
    required: false,
  })
  max?: number;

  @ApiProperty({
    description:
      'Enumerated set of allowed values the client may choose from. ' +
      'When present, the UI should restrict input to these values only ' +
      '(typically rendered as a DropDown). ' +
      'Each entry may be a NameValuePairDto or BitFieldDto.',
    type: 'array',
    items: {
      oneOf: [
        {$ref: '#/components/schemas/NameValuePairDto'},
        {$ref: '#/components/schemas/BitFieldDto'},
      ],
    },
    required: false,
  })
  allowedValues?: NameValuePairDto[] | BitFieldDto[];

  @ApiProperty({
    description:
      'List of element names that are linked to this element. ' +
      'These elements have a relationship with this element, typically through formula calculations. ' +
      'Used by the UI to understand and manage element relationships.',
    type: [String],
    required: false,
  })
  linkedElementNames?: string[];
}
