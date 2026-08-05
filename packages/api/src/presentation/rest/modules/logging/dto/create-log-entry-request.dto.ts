/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import {ApiProperty, ApiPropertyOptional} from '@nestjs/swagger';
import {LogLevel} from '@arc/core';

export class CreateLogEntryRequestDto {
  @ApiProperty({enum: LogLevel})
  @IsEnum(LogLevel)
  level!: LogLevel;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty()
  @IsDateString()
  timestamp!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  msg!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  component!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  tag!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  error?: string;
}
