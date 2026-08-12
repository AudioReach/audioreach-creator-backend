/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({description: 'Client name'})
  clientName: string;

  constructor(name: string) {
    this.clientName = name;
  }
}

export class RegisterResponseDto {
  @ApiProperty({description: 'JWT token for authentication'})
  token!: string;

  @ApiProperty({description: 'Unique client identifier'})
  clientId!: number;

  @ApiProperty({description: 'Client name'})
  clientName!: string | number;
}
