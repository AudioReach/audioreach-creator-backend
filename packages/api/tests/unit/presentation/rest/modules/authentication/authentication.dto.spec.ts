/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ValidationPipe} from '@nestjs/common';
import {DEFAULT_SERVICE_NAME} from '@arc/logger';
import {
  CLIENT_NAME_MAX_LENGTH,
  RegisterDto,
} from '../../../../../../src/presentation/rest/modules/authentication/dto/authentication.dto.js';

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

  it('accepts a clientName at the length limit', async () => {
    const clientName = 'a'.repeat(CLIENT_NAME_MAX_LENGTH);
    await expect(
      pipe.transform(
        {clientName},
        {type: 'body', metatype: RegisterDto, data: ''},
      ),
    ).resolves.toEqual(expect.objectContaining({clientName}));
  });

  it.each([
    ['a non-string clientName', {clientName: 123}],
    ['a missing clientName', {}],
    ['an empty clientName', {clientName: ''}],
    [
      'a clientName over the length limit',
      {clientName: 'a'.repeat(CLIENT_NAME_MAX_LENGTH + 1)},
    ],
    ["the API's own service name", {clientName: DEFAULT_SERVICE_NAME}],
  ])('rejects %s', async (_label, body) => {
    await expect(
      pipe.transform(body, {type: 'body', metatype: RegisterDto, data: ''}),
    ).rejects.toThrow();
  });
});
