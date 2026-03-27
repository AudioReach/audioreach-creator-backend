/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {ParameterDetailDto} from '../parameter.dto.js';
import {BaseDto} from '../base.dto.js';
import {KeyValueDto} from '../key-value.dto.js';

/**
 * DTO for tag data.
 * Extends BaseDto with an array of parameters containing their tag elements
 * and an array of TKV (Tag Key-Value) pairs.
 */
export class TagDataDto extends BaseDto {
  @ApiProperty({
    description: 'Unique system identifier for the tkv',
    type: String,
  })
  systemId!: string;

  @ApiProperty({
    description:
      'Array of Tag Key-Value pairs. ' +
      'Each entry contains key and value information with their respective IDs, names, and system identifiers.',
    type: [KeyValueDto],
  })
  Tkv!: KeyValueDto[];

  @ApiProperty({
    description:
      'Array of parameter data, one entry per PID. ' +
      'Each entry contains the system identifier, PID, name, description, ' +
      'and the list of tag elements belonging to that parameter.',
    type: [ParameterDetailDto],
  })
  parameters!: ParameterDetailDto[];
}
