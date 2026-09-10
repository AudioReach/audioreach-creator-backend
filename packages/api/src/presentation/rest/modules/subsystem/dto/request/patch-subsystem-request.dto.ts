/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsInt, IsOptional, IsString, MaxLength, Min} from 'class-validator';

/**
 * Request DTO for partially updating subsystem properties.
 * All fields are optional — only provided fields will be updated.
 */
export class PatchSubsystemRequestDto {
  @ApiProperty({
    description: 'Subsystem name. Max 255 characters.',
    required: false,
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiProperty({
    description:
      'Target number of input data ports. The API will add or remove input DataPort entities to reach this count.',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  inputDataPortCount?: number;

  @ApiProperty({
    description:
      'Target number of output data ports. The API will add or remove output DataPort entities to reach this count.',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  outputDataPortCount?: number;

  @ApiProperty({
    description:
      'Target number of control ports. The API will add or remove ControlPort entities to reach this count.',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  controlPortCount?: number;
}
