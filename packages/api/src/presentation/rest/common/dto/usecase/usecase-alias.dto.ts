/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

/**
 * DTO for usecase alias information.
 * Contains alias identification fields for a usecase.
 */
export class UsecaseAliasDto {
  @ApiProperty({
    description: 'Unique identifier for the usecase alias',
    type: Number,
  })
  id!: number;

  @ApiProperty({
    description: 'Human-readable name for the usecase alias',
    type: String,
  })
  name!: string;
}
