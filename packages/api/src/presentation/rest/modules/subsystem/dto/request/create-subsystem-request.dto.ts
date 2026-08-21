/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsOptional, IsString} from 'class-validator';

/**
 * Request DTO for creating an empty subsystem.
 */
export class CreateSubsystemRequestDto {
  @ApiProperty({
    description:
      'Subsystem name. Must be unique within the project. If not provided, a name will be auto-generated.',
    required: false,
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    description:
      'System ID of the parent subsystem. If not provided, the subsystem is created at the root level.',
    required: false,
    type: 'string',
  })
  @IsOptional()
  @IsString()
  parentSystemId?: string;
}
