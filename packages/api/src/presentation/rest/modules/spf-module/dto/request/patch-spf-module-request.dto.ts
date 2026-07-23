/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsOptional, IsString, IsInt, Min, MaxLength} from 'class-validator';
import {Type} from 'class-transformer';

/**
 * Request DTO for partially updating SPF module properties.
 * All fields are optional — only provided fields will be updated.
 * class-validator decorators are required so ValidationPipe(whitelist:true)
 * does not strip them from the request body.
 */
export class PatchSpfModuleRequestDto {
  @ApiProperty({
    description: 'Module alias. Maximum 250 characters.',
    required: false,
    maxLength: 250,
  })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  alias?: string;

  @ApiProperty({
    description:
      'Container ID. If the ID does not exist, a new container will be created ' +
      'with default properties copied from the current container.',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  containerId?: number;

  @ApiProperty({
    description:
      'Maximum number of input ports supported. ' +
      'Validated against module definition limits.',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  maxInputPortsSupported?: number;

  @ApiProperty({
    description:
      'Maximum number of output ports supported. ' +
      'Validated against module definition limits.',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  maxOutputPortsSupported?: number;

  @ApiProperty({
    description:
      'Maximum number of control ports supported. ' +
      'Validated against module definition limits.',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  maxControlPortsSupported?: number;
}
