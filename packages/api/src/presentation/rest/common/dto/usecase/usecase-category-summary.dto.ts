/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {BaseDto} from '../base.dto.js';

/**
 * Summary DTO containing essential usecase category identification fields.
 * Used for list views and lightweight category representations.
 */
export class UsecaseCategorySummaryDto extends BaseDto {
  @ApiProperty({
    description: 'Unique system identifier for the usecase category',
    type: String,
  })
  systemId!: string;

  @ApiProperty({
    description: 'Name of the usecase category',
    type: String,
  })
  name!: string;
}
