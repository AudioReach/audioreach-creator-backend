/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Controller, Post, Body, HttpStatus} from '@nestjs/common';
import {ApiTags} from '@nestjs/swagger';
import {AuthenticationService} from './authentication.service.js';
import {RegisterDto, RegisterResponseData} from './dto/authentication.dto.js';
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';
import {toApiResult} from '../../common/result/to-api-result.js';
import {Result} from '@arc/core';

@ApiTags('authentication')
@Controller('arc-api/v1/auth')
export class AuthenticationController {
  constructor(private authService: AuthenticationService) {}

  @Post('register')
  @ApiDocumentationWithExample({
    summary: 'Register client',
    requestDto: RegisterDto,
    requestRequired: false,
    requestDtoExample: {
      className: 'RegisterDtoExample',
    },
    wrapInApiResult: false, // This method returns ApiResult<T> directly, not Promise<ApiResult<T>>
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Client registered successfully',
        dto: RegisterResponseData,
        example: {
          className: 'RegisterResponseDataExample',
        },
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Failed to register client',
      },
    ],
  })
  register(@Body() request?: RegisterDto): ApiResult<RegisterResponseData> {
    const data = this.authService.register(request);
    return toApiResult(Result.ok(data));
  }
}
