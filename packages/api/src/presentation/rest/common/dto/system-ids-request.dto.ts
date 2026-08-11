/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsArray, IsString, ArrayNotEmpty} from 'class-validator';

export class SystemIdsRequestDto {
  @ApiProperty({type: [String], description: 'Array of system IDs'})
  @IsArray()
  @ArrayNotEmpty()
  @IsString({each: true})
  systemIds!: string[];
}
