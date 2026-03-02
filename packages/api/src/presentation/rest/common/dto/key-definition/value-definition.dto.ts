/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {BaseDto} from '../base.dto.js';

export class ValueDefinitionSummaryDto extends BaseDto {
  @ApiProperty({description: 'Unique system identifier for the value'})
  systemId!: string;

  @ApiProperty({description: 'Value identifier'})
  valueId!: number;

  @ApiProperty({description: 'Value name'})
  name!: string;
}

export class ValueDefinitionDto extends ValueDefinitionSummaryDto {
  @ApiProperty({description: 'Value description', required: false})
  description?: string;

  @ApiProperty({
    description: 'Value enum value for pseudo header file',
    required: false,
  })
  cHeaderEnumValue?: string;

  @ApiProperty({
    description:
      'Special value (present if specialKey is SampleRate or Volume)',
    required: false,
  })
  specialValue?: string;
}
