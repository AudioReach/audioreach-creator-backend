/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, IsNumber, IsOptional, IsString} from 'class-validator';

/**
 * Request DTO for creating an empty subsystem.
 */
export class CreateSubsystemRequestDto {
  @ApiProperty({
    description: 'Subsystem name.',
    required: true,
    maxLength: 255,
  })
  @IsNotEmpty()
  @IsString()
  name!: string;

  @ApiProperty({
    description:
      'System ID of the parent subsystem. If not provided, the subsystem is created at the root level.',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  parentId?: number;
}
