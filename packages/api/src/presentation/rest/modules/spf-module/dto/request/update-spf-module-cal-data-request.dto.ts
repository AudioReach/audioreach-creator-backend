/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsArray, IsOptional, IsString} from 'class-validator';
import {ParameterResponseDto} from '../../../../common/dto/parameter-response.dto.js';

export class UpdateSpfModuleCalDataRequestDto {
  @ApiProperty({
    description: 'Array of calibration data updates for multiple parameters',
    type: [ParameterResponseDto],
  })
  @IsArray()
  parameters!: ParameterResponseDto[];

  @ApiProperty({
    description: 'UI persistence string',
    required: false,
  })
  @IsOptional()
  @IsString()
  uiPersistence?: string;
}
