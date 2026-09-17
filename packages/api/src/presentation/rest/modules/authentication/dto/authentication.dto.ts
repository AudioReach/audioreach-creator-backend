/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsOptional, IsString} from 'class-validator';

export class RegisterDto {
  @ApiProperty({description: 'Client name', required: false})
  @IsOptional()
  @IsString()
  clientName?: string;

  constructor(name?: string) {
    this.clientName = name;
  }
}

export class RegisterResponseDto {
  @ApiProperty({description: 'JWT token for authentication'})
  token!: string;

  @ApiProperty({description: 'Unique client identifier'})
  clientId!: string;

  @ApiProperty({description: 'Client name'})
  clientName!: string;
}
