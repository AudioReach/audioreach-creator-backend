/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Type} from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {ApiPropertyOptional} from '@nestjs/swagger';
import {
  LOG_SEARCH_DEFAULT_LIMIT,
  LOG_SEARCH_MAX_LIMIT,
  LogOrigin,
  LogSortOrder,
} from '@arc/logger';
import {LogLevel} from '@arc/core';
import {CLIENT_NAME_MAX_LENGTH} from '../../authentication/dto/authentication.dto.js';

/** Paging parameters shared by the log read endpoints (design §10). */
export class LogPageRequestDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: LOG_SEARCH_MAX_LIMIT,
    default: LOG_SEARCH_DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LOG_SEARCH_MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional({
    description:
      'The nextCursor of the previous page. Valid only with the same filters ' +
      '(and order); anything else is rejected with 400.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cursor?: string;
}

export class ProjectLogsRequestDto extends LogPageRequestDto {
  @ApiPropertyOptional({
    maxLength: CLIENT_NAME_MAX_LENGTH,
    description:
      'Only records belonging to this client: the ones it submitted and the ' +
      'server records written for its requests.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(CLIENT_NAME_MAX_LENGTH)
  clientName?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Only records belonging to this client launch, by the same rule.',
  })
  @IsOptional()
  @IsUUID()
  clientInstanceId?: string;

  @ApiPropertyOptional({
    enum: LogOrigin,
    enumName: 'LogOrigin',
    description: 'Only records the client submitted, or only server records.',
  })
  @IsOptional()
  @IsEnum(LogOrigin)
  origin?: LogOrigin;

  @ApiPropertyOptional({
    enum: LogLevel,
    enumName: 'LogLevel',
    description:
      'Only records at this level or more severe; WARN gives WARN, ERROR ' +
      'and CRITICAL.',
  })
  @IsOptional()
  @IsEnum(LogLevel)
  minLevel?: LogLevel;

  @ApiPropertyOptional({
    enum: LogSortOrder,
    enumName: 'LogSortOrder',
    default: LogSortOrder.Desc,
    description: 'Sort by (timestamp, systemId); desc is newest first.',
  })
  @IsOptional()
  @IsEnum(LogSortOrder)
  order?: LogSortOrder;
}

export class ClientInstancesRequestDto extends LogPageRequestDto {
  @ApiPropertyOptional({
    maxLength: CLIENT_NAME_MAX_LENGTH,
    description: 'Only launches of this client.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(CLIENT_NAME_MAX_LENGTH)
  clientName?: string;
}
