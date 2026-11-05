/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Injectable} from '@nestjs/common';
import {JwtService} from '@nestjs/jwt';
import {generateUuid} from '@arc/core';
import {RegisterDto, RegisterResponseDto} from './dto/authentication.dto.js';
import type {AccessTokenPayload} from './access-token-payload.js';

@Injectable()
export class AuthenticationService {
  constructor(private jwtService: JwtService) {}

  register(request: RegisterDto): RegisterResponseDto {
    const payload: AccessTokenPayload = {
      clientId: generateUuid(),
      clientName: request.clientName,
    };
    return {
      token: this.jwtService.sign(payload),
      clientId: payload.clientId,
      clientName: payload.clientName,
    };
  }
}
