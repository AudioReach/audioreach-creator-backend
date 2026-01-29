/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {CLIENT_INPUT_TYPE, type ClientInputType} from '@arc/core';

export class ApiClientInputSpecDto {
  @ApiProperty({
    description:
      'Key in commandPayload the client must fill in before calling POST /apply-fix',
  })
  field!: string;

  @ApiProperty({description: 'Human-readable label shown to the user'})
  label!: string;

  @ApiProperty({
    enum: CLIENT_INPUT_TYPE,
    enumName: 'ClientInputType',
    description: 'Input type to render in the UI',
  })
  type!: ClientInputType;
}

export class ApiFixOptionDto {
  @ApiProperty({
    description:
      'Unique identifier for this fix option (e.g. delete-duplicate-link)',
  })
  id!: string;

  @ApiProperty({
    description: 'Human-readable description of what this fix does',
  })
  description!: string;

  @ApiProperty({
    description: 'Command type string dispatched via POST /apply-fix',
  })
  commandType!: string;

  @ApiProperty({
    description:
      'Partial command payload; null fields must be filled by the client via requiredClientInputs',
  })
  commandPayload!: Record<string, unknown>;

  @ApiProperty({
    type: [ApiClientInputSpecDto],
    description: 'Client inputs required before this fix can be dispatched',
  })
  requiredClientInputs!: ApiClientInputSpecDto[];
}
