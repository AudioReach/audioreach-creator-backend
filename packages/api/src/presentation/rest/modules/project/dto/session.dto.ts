/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsEnum, IsNotEmpty} from 'class-validator';
import {SessionMode} from '../enums/session-mode.enum.js';

/** Request DTO for starting a session */
export class StartSessionRequestDto {
  @ApiProperty({
    enum: SessionMode,
    description: 'Session mode to start',
    enumName: 'SessionMode',
  })
  @IsEnum(SessionMode)
  @IsNotEmpty()
  mode!: SessionMode;
}

/** Response DTO for session operations */
export class SessionResponseDto {
  @ApiProperty({description: 'Project identifier'})
  projectId!: string;

  @ApiProperty({
    enum: SessionMode,
    description: 'Current session mode',
    enumName: 'SessionMode',
  })
  sessionMode!: SessionMode;

  @ApiProperty({
    description:
      'Summary of the session operation including any changes committed or cleared',
  })
  summary!: string;
}
