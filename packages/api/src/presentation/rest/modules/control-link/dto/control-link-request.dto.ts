/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsBoolean, IsNotEmpty, IsOptional, IsString} from 'class-validator';

/**
 * DTO for creating a new control link
 */
export class CreateControlLinkRequest {
  @ApiProperty({
    description: 'System ID of the start component',
  })
  @IsNotEmpty()
  @IsString()
  startComponentSystemId!: string;

  @ApiProperty({
    description: 'System ID of the start port',
  })
  @IsNotEmpty()
  @IsString()
  startPortSystemId!: string;

  @ApiProperty({
    description: 'System ID of the end component',
  })
  @IsNotEmpty()
  @IsString()
  endComponentSystemId!: string;

  @ApiProperty({
    description: 'System ID of the end port',
  })
  @IsNotEmpty()
  @IsString()
  endPortSystemId!: string;

  @ApiProperty({
    description: 'System ID of the parent component',
    required: false,
  })
  @IsOptional()
  @IsString()
  parentSystemId?: string;

  @ApiProperty({
    description: 'Is inter-usecase',
    default: false,
  })
  @IsBoolean()
  isInterUsecase: boolean = false;
}
