/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {DataTypeDto} from '../utils/data-type.factory.js';

/**
 * Represents a named value with its associated data type.
 *
 * Used for data fields that have a human-readable name and a corresponding
 * value. The value type is included so clients can validate and manipulate
 * the value accordingly.
 */
export class NameValueDto {
  @ApiProperty({description: 'Name field'})
  name!: string;

  @ApiProperty({description: 'Value field'})
  value!: string;

  @ApiProperty({description: 'Data type information', type: DataTypeDto})
  valueDataType!: DataTypeDto;
}
