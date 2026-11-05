/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty, ApiPropertyOptional} from '@nestjs/swagger';
import {LogLevel} from '@arc/core';
import {LogOrigin} from '@arc/logger';

export class LogEntryResponseDto {
  @ApiProperty()
  systemId!: string;

  @ApiProperty({enum: LogLevel, enumName: 'LogLevel'})
  level!: LogLevel;

  @ApiProperty({description: 'When the record was produced, ISO-8601'})
  timestamp!: string;

  @ApiProperty()
  eventName!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  component!: string;

  @ApiProperty()
  tag!: string;

  @ApiProperty({
    enum: LogOrigin,
    enumName: 'LogOrigin',
    description:
      'CLIENT: submitted through POST /logs; SERVER: written by the API',
  })
  origin!: LogOrigin;

  @ApiPropertyOptional({
    description:
      'The client that submitted the record, or the client a server record was written for',
  })
  clientName?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'The client launch the record belongs to, by the same rule',
  })
  clientInstanceId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Server records only: the API run that wrote the record',
  })
  serverInstanceId?: string;

  @ApiPropertyOptional()
  projectId?: string;

  @ApiPropertyOptional()
  error?: string;
}

export class LogEntryPageResponseDto {
  @ApiProperty({type: [LogEntryResponseDto]})
  items!: LogEntryResponseDto[];

  @ApiPropertyOptional({
    description:
      'Pass as cursor to get the next page; omitted on the last page',
  })
  nextCursor?: string;

  @ApiPropertyOptional({
    description:
      'First page only (no cursor): the number of records matching the ' +
      'filter when the page was read. An estimate for progress; the listing ' +
      'is complete when nextCursor is absent.',
  })
  totalCount?: number;
}

export class ClientInstanceResponseDto {
  @ApiPropertyOptional()
  clientName?: string;

  @ApiProperty({format: 'uuid'})
  clientInstanceId!: string;

  @ApiProperty({
    type: [String],
    description: 'Projects the launch has records for, ascending',
  })
  projectIds!: string[];

  @ApiProperty({description: 'Earliest record timestamp, ISO-8601'})
  firstTimestamp!: string;

  @ApiProperty({description: 'Latest record timestamp, ISO-8601'})
  lastTimestamp!: string;

  @ApiProperty({description: 'Number of project records of the launch'})
  recordCount!: number;

  @ApiProperty({description: 'How many of them are ERROR or CRITICAL'})
  errorCount!: number;
}

export class ClientInstancePageResponseDto {
  @ApiProperty({type: [ClientInstanceResponseDto]})
  items!: ClientInstanceResponseDto[];

  @ApiPropertyOptional({
    description:
      'Pass as cursor to get the next page; omitted on the last page',
  })
  nextCursor?: string;

  @ApiPropertyOptional({
    description:
      'First page only (no cursor): the number of launches matching the ' +
      'filter when the page was read. An estimate for progress; the listing ' +
      'is complete when nextCursor is absent.',
  })
  totalCount?: number;
}
