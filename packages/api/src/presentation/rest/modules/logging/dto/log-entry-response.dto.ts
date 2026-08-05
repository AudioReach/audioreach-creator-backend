/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty, ApiPropertyOptional} from '@nestjs/swagger';
import type {LogLevel} from '@arc/core';

export class LogEntryResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  level!: LogLevel;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  timestamp!: string;

  @ApiProperty()
  msg!: string;

  @ApiProperty()
  component!: string;

  @ApiProperty()
  tag!: string;

  @ApiProperty()
  source!: string;

  @ApiPropertyOptional()
  projectId?: string;

  @ApiPropertyOptional()
  error?: string;
}
