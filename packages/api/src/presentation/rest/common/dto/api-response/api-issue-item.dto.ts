/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {
  ISSUE_ENTITY_TYPE,
  IssueSeverity,
  IssueCategory,
  type IssueEntityType,
} from '@arc/core';
import {ApiFixOptionDto} from './api-fix-option.dto.js';

/**
 * Nested DTO for the impacted-entity field on ApiIssueItem.
 *
 * Structurally mirrors core `ImpactedEntity` from
 * `packages/core/src/shared/issues/impacted-entity.ts`.
 */
export class ApiImpactedEntityDto {
  @ApiProperty({
    description: 'The type of entity this issue applies to.',
    enum: ISSUE_ENTITY_TYPE,
    enumName: 'IssueEntityType',
  })
  entityType!: IssueEntityType;

  @ApiProperty({
    description: 'System-level identifier of the impacted entity.',
    type: 'number',
  })
  systemId!: number;

  @ApiProperty({
    description: 'Human-readable name for display (e.g., module alias).',
    required: false,
    type: 'string',
  })
  displayName?: string;
}

/**
 * Wire representation of a single structured issue, carried by
 * `ApiResult<T>.issues[]`.
 *
 * Structurally mirrors core `Issue` (design §6.2, FR-4.1). The mapper
 * `toApiIssueItem` performs a field-for-field projection — extra fields
 * on `ValidationIssue` (`name`, `defaultSeverity`) are deliberately not
 * projected so the wire shape stays purely `Issue`.
 */
export class ApiIssueItem {
  @ApiProperty({
    description:
      'Machine-readable issue code. Validation rules use ARC-{ENTITY}-{SEQ}; ' +
      'operational codes are descriptive constants (ENTITY_NOT_FOUND, DB_QUERY_FAILED, PARSE_ERROR).',
    type: 'string',
  })
  code!: string;

  @ApiProperty({
    description: 'Human-readable message describing the issue.',
    type: 'string',
  })
  message!: string;

  @ApiProperty({
    description: 'Severity of the issue.',
    enum: IssueSeverity,
    enumName: 'IssueSeverity',
  })
  severity!: IssueSeverity;

  @ApiProperty({
    description:
      'Optional broader classification (BLOCKING / NON_BLOCKING / DATA_LOSS). ' +
      'Populated by validation issues; typically absent on operational issues.',
    enum: IssueCategory,
    enumName: 'IssueCategory',
    required: false,
  })
  category?: IssueCategory;

  @ApiProperty({
    description: 'The entity this issue applies to, if any.',
    type: ApiImpactedEntityDto,
    required: false,
  })
  impactedEntity?: ApiImpactedEntityDto;

  @ApiProperty({
    description: 'Use-case systemIds affected by this issue, if any.',
    type: [Number],
    required: false,
  })
  impactedUsecases?: number[];

  @ApiProperty({
    description: 'Client-actionable fix options, if any.',
    type: [ApiFixOptionDto],
    required: false,
  })
  fixOptions?: ApiFixOptionDto[];
}
