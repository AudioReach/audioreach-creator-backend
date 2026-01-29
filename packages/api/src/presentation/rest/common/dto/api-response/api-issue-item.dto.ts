/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {
  IssueSeverity,
  IssueCategory,
  VALIDATION_ENTITY_TYPE,
  type ValidationEntityType,
} from '@arc/core';
import {ApiFixOptionDto} from './api-fix-option.dto.js';

export class ApiImpactedEntityDto {
  @ApiProperty({enum: VALIDATION_ENTITY_TYPE, enumName: 'IssueEntityType'})
  entityType!: ValidationEntityType;

  @ApiProperty({description: 'Database system ID of the impacted entity'})
  systemId!: number;

  @ApiProperty({
    required: false,
    description: 'Human-readable name for display (e.g. module alias)',
  })
  displayName?: string;
}

/**
 * Unified issue item used in ApiResult.issues[].
 *
 * Operational failures (parse errors, bulk item failures) populate only
 * {code, message, severity}. Domain validation issues populate all fields.
 *
 * A DATA_LOSS category item implies that save is blocked (blockedSave semantics).
 */
export class ApiIssueItem {
  @ApiProperty({
    description:
      'Machine-readable issue code. Validation rules follow ARC-{ENTITY}-{SEQ} format ' +
      '(e.g. ARC-MOD-001). Operational failures use descriptive constants (e.g. DB_QUERY_FAILED).',
  })
  code!: string;

  @ApiProperty({description: 'Human-readable issue detail'})
  message!: string;

  @ApiProperty({enum: IssueSeverity, enumName: 'IssueSeverity'})
  severity!: IssueSeverity;

  @ApiProperty({
    enum: IssueCategory,
    enumName: 'IssueCategory',
    required: false,
    description:
      'Present for domain validation issues; absent for operational failures',
  })
  category?: IssueCategory;

  @ApiProperty({
    type: ApiImpactedEntityDto,
    required: false,
    description:
      'Present for domain validation issues; absent for operational failures',
  })
  impactedEntity?: ApiImpactedEntityDto;

  @ApiProperty({
    type: [Number],
    required: false,
    description: 'System IDs of use cases affected by this issue',
  })
  impactedUsecases?: number[];

  @ApiProperty({
    type: [ApiFixOptionDto],
    required: false,
    description:
      'Actionable fix commands the client can dispatch via POST /apply-fix',
  })
  fixOptions?: ApiFixOptionDto[];
}
