/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Injectable} from '@nestjs/common';
import {JwtService} from '@nestjs/jwt';
import {v4 as uuidv4} from 'uuid';
import {RegisterDto, RegisterResponseDto} from './dto/authentication.dto.js';

@Injectable()
export class AuthenticationService {
  constructor(private jwtService: JwtService) {}

  register(request?: RegisterDto): RegisterResponseDto {
    const id = uuidv4();
    const name = request?.clientName ?? id;
    const payload = {clientId: id};
    return {
      token: this.jwtService.sign(payload),
      clientId: id,
      clientName: name,
    };
  }
}
