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
  MaxLength,
} from 'class-validator';
import {ApiProperty, ApiPropertyOptional} from '@nestjs/swagger';
import {LogLevel} from '@arc/core';

/**
 * Limit for identifier-like fields that readers filter or group on. Free
 * text is bounded only by the HTTP body limit (design §7).
 */
export const LOG_IDENTIFIER_MAX_LENGTH = 256;

/** A log record written by a client (design §7). */
export class CreateLogEntryRequestDto {
  @ApiProperty({enum: LogLevel, enumName: 'LogLevel'})
  @IsEnum(LogLevel)
  level!: LogLevel;

  @ApiProperty({
    maxLength: LOG_IDENTIFIER_MAX_LENGTH,
    description: 'Stable dotted event name, such as project.open.succeeded',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(LOG_IDENTIFIER_MAX_LENGTH)
  eventName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty({description: 'When the client produced the record'})
  @IsDateString()
  timestamp!: string;

  @ApiProperty({maxLength: LOG_IDENTIFIER_MAX_LENGTH})
  @IsString()
  @IsNotEmpty()
  @MaxLength(LOG_IDENTIFIER_MAX_LENGTH)
  component!: string;

  @ApiProperty({maxLength: LOG_IDENTIFIER_MAX_LENGTH})
  @IsString()
  @IsNotEmpty()
  @MaxLength(LOG_IDENTIFIER_MAX_LENGTH)
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
