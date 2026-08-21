/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {BadRequestException, ValidationPipe} from '@nestjs/common';
import {
  CreateControlLinkFlatRequest,
  CreateControlLinkWithSubsystemsRequest,
} from '../../../../../../src/presentation/rest/modules/control-link/dto/control-link-request.dto.js';

describe('control-link creation request DTOs', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  it('rejects parentId for the flat endpoint', async () => {
    await expect(
      pipe.transform(
        {
          startModuleSystemId: '1',
          startPortId: '11',
          endModuleSystemId: '2',
          endPortId: '22',
          parentId: '10',
        },
        {metatype: CreateControlLinkFlatRequest, type: 'body'},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects parentId for the hierarchical endpoint', async () => {
    await expect(
      pipe.transform(
        {
          startComponentId: '1',
          startPortId: '11',
          endComponentId: '10',
          endPortId: '101',
          parentId: '10',
        },
        {metatype: CreateControlLinkWithSubsystemsRequest, type: 'body'},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
