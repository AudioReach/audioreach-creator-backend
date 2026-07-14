/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {CLIENT_INPUT_TYPE, type ClientInputType} from '@arc/core';

/**
 * Client-input specification for a fix option. Mirrors core `ClientInputSpec`
 * from `packages/core/src/shared/issues/fix-option.ts`.
 */
export class ApiClientInputSpecDto {
  @ApiProperty({
    description:
      'Key in commandPayload the client must fill in before dispatching the fix.',
    type: 'string',
  })
  field!: string;

  @ApiProperty({
    description: 'UI prompt label shown to the user.',
    type: 'string',
  })
  label!: string;

  @ApiProperty({
    description: 'Input type the UI should render.',
    enum: CLIENT_INPUT_TYPE,
    enumName: 'ClientInputType',
  })
  type!: ClientInputType;
}

/**
 * Client-actionable fix option carried by ApiIssueItem.fixOptions[]. Mirrors
 * core `FixOption` from `packages/core/src/shared/issues/fix-option.ts`.
 */
export class ApiFixOptionDto {
  @ApiProperty({
    description: 'Stable identifier — e.g. "delete-duplicate-link".',
    type: 'string',
  })
  id!: string;

  @ApiProperty({
    description: 'Human-readable description of the fix.',
    type: 'string',
  })
  description!: string;

  @ApiProperty({
    description: 'Discriminator consumed by the fix-command dispatcher.',
    type: 'string',
  })
  commandType!: string;

  @ApiProperty({
    description:
      'Prefilled command payload — fields the client must fill in are set to null.',
    type: 'object',
    additionalProperties: true,
  })
  commandPayload!: Record<string, unknown>;

  @ApiProperty({
    description: 'Fields the client must fill in before dispatching.',
    type: [ApiClientInputSpecDto],
  })
  requiredClientInputs!: ApiClientInputSpecDto[];
}
