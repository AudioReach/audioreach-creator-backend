/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  RegisterDto,
  RegisterResponseDto,
} from '../../../modules/authentication/dto/authentication.dto.js';

export const RegisterDtoExample = {
  getExample(): RegisterDto {
    const dto = new RegisterDto('client-123');
    return dto;
  },
};

export const RegisterResponseDataExample = {
  getExample(): RegisterResponseDto {
    return {
      token: 'jwt.token.here',
      clientId: 1,
      clientName: 'client-123',
    };
  },
};
