/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {IsIn, IsNotEmpty, IsOptional, IsString} from 'class-validator';
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
    type: 'string',
  })
  @IsNotEmpty()
  @IsString()
  sourceNodeSystemId!: string;

  @ApiProperty({
    description: 'System ID of the source port',
    type: 'string',
  })
  @IsNotEmpty()
  @IsString()
  sourcePortSystemId!: string;

  @ApiProperty({
    description: 'System ID of the destination node/module',
    type: 'string',
  })
  @IsNotEmpty()
  @IsString()
  destinationNodeSystemId!: string;

  @ApiProperty({
    description: 'System ID of the destination port',
    type: 'string',
  })
  @IsNotEmpty()
  @IsString()
  destinationPortSystemId!: string;
}
