/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, IsNotIn, IsString, MaxLength} from 'class-validator';
import {DEFAULT_SERVICE_NAME} from '@arc/logger';

export const CLIENT_NAME_MAX_LENGTH = 256;

export class RegisterDto {
  @ApiProperty({
    description:
      'Name of the client application, such as `audioreach-creator-ui`. ' +
      'It is signed into the token and recorded with the logs of every ' +
      `request the client makes. Must not be \`${DEFAULT_SERVICE_NAME}\`.`,
    maxLength: CLIENT_NAME_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(CLIENT_NAME_MAX_LENGTH)
  @IsNotIn([DEFAULT_SERVICE_NAME], {
    message: `clientName must not be the API's own name, ${DEFAULT_SERVICE_NAME}`,
  })
  clientName!: string;

  constructor(clientName: string) {
    this.clientName = clientName;
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
