/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty, ApiPropertyOptional} from '@nestjs/swagger';
import {CLIENT_INPUT_TYPE, type ClientInputType} from '@arc/core';
import type {ApiIssueParams, ApiRelatedEntities} from './api-issue-item.dto.js';

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
 * Client-actionable fix option carried by ApiIssueItem.fixOptions[], from a
 * rendered or a legacy fix option.
 */
export class ApiFixOptionDto {
  @ApiProperty({
    description: 'Stable identifier — e.g. "delete-duplicate-link".',
    type: 'string',
  })
  id!: string;

  @ApiProperty({
    description:
      'The kind of fix, e.g. SELECT_CANDIDATE. Its roles and params are ' +
      'listed under the issue code in ApiIssueItem.relatedEntities. ' +
      'Absent on fix options that are not yet rendered from facts.',
    type: 'string',
    required: false,
  })
  kind?: string;

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

  @ApiPropertyOptional({
    description:
      'Entities the fix concerns, by role; omitted when there are none. ' +
      'Same forms as ApiIssueItem.relatedEntities.',
    type: 'object',
    additionalProperties: true,
  })
  relatedEntities?: ApiRelatedEntities;

  @ApiPropertyOptional({
    description:
      'Machine context of the fix that is not an entity; omitted when ' +
      'there is none.',
    type: 'object',
    additionalProperties: {oneOf: [{type: 'string'}, {type: 'number'}]},
  })
  params?: ApiIssueParams;
}
