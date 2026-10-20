/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, IsObject, IsString} from 'class-validator';

export class ApplyFixRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  commandType!: string;

  @ApiProperty()
  @IsObject()
  commandPayload!: Record<string, unknown>;
}
