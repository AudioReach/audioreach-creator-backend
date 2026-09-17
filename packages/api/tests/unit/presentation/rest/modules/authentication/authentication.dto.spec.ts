/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ValidationPipe} from '@nestjs/common';
import {RegisterDto} from '../../../../../../src/presentation/rest/modules/authentication/dto/authentication.dto.js';

describe('RegisterDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });

  it('accepts clientName with the application validation settings', async () => {
    await expect(
      pipe.transform(
        {clientName: 'audioreach-creator-ui'},
        {type: 'body', metatype: RegisterDto, data: ''},
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        clientName: 'audioreach-creator-ui',
      }),
    );
  });

  it('rejects a non-string clientName', async () => {
    await expect(
      pipe.transform(
        {clientName: 123},
        {type: 'body', metatype: RegisterDto, data: ''},
      ),
    ).rejects.toThrow();
  });
});
