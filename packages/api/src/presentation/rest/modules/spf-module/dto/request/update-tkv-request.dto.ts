/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsArray, ArrayNotEmpty, IsOptional, IsString} from 'class-validator';
import {ParameterDto} from '../../../../common/dto/parameter.dto.js';

export class UpdateTkvRequestDto {
  @ApiProperty({
    description:
      'Array of tag calibration data updates for multiple parameters',
    type: [ParameterDto],
  })
  @IsArray()
  @ArrayNotEmpty()
  parameters!: ParameterDto[];

  @ApiProperty({
    description: 'UI persistence string',
    required: false,
  })
  @IsOptional()
  @IsString()
  uiPersistence?: string;
}
