/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {IsIn, IsNumber, IsOptional, IsString} from 'class-validator';
import {ApiProperty} from '@nestjs/swagger';

/**
 * DTO for creating a new data link
 */
export class CreateDataLinkRequest {
  @ApiProperty({
    description: 'Type of data link',
    type: 'string',
    enum: ['normal', 'EC', 'interUsecase'],
    default: 'normal',
    required: false,
  })
  @IsString()
  @IsIn(['normal', 'EC', 'interUsecase'])
  @IsOptional()
  type?: 'normal' | 'EC' | 'interUsecase' = 'normal';

  @ApiProperty({
    description: 'System ID of the source node/module',
    type: 'number',
  })
  @IsNumber()
  sourceNodeSystemId!: number;

  @ApiProperty({
    description: 'System ID of the source port',
    type: 'number',
  })
  @IsNumber()
  sourcePortSystemId!: number;

  @ApiProperty({
    description: 'System ID of the destination node/module',
    type: 'number',
  })
  @IsNumber()
  destinationNodeSystemId!: number;

  @ApiProperty({
    description: 'System ID of the destination port',
    type: 'number',
  })
  @IsNumber()
  destinationPortSystemId!: number;
}
