/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty, ApiPropertyOptional} from '@nestjs/swagger';
import {
  ENTITY_TYPE,
  IssueSeverity,
  IssueCategory,
  type EntityType,
  type ParamValue,
} from '@arc/core';
import {ApiFixOptionDto} from './api-fix-option.dto.js';
import {
  ISSUE_PARAMS_DESCRIPTION,
  RELATED_ENTITIES_DESCRIPTION,
} from './issue-context.docs.js';

/**
 * An entity named by an issue: its type, its systemId for machines, and its
 * display name for people. Used for `impactedEntity`, `impactedUsecases`,
 * and every entity in `relatedEntities`.
 */
export class ApiEntityRef {
  @ApiProperty({
    description: 'The type of the entity.',
    enum: ENTITY_TYPE,
    enumName: 'IssueEntityType',
  })
  entityType!: EntityType;

  @ApiProperty({
    description: 'System-level identifier of the entity.',
    type: 'string',
  })
  systemId!: string;

  @ApiProperty({
    description:
      "The entity's natural identity for display, e.g. " +
      '"Subgraph \'Mic capture\' (0x00001234)". Absent on issues that are ' +
      'not yet rendered from facts.',
    required: false,
    type: 'string',
  })
  displayName?: string;
}

/**
 * One group in a list of groups in `relatedEntities`: entities that belong
 * together, such as a key and the subgraphs that conflict on it.
 */
export type ApiRelatedEntityGroup = Record<
  string,
  ApiEntityRef | ApiEntityRef[]
>;

/** Related entities by role: one entity, a list, or a list of groups. */
export type ApiRelatedEntities = Record<
  string,
  ApiEntityRef | ApiEntityRef[] | ApiRelatedEntityGroup[]
>;

/** Machine context of an issue or fix option that is not an entity. */
export type ApiIssueParams = Record<string, ParamValue>;

/**
 * Wire representation of a single structured issue, carried by
 * `ApiResult<T>.issues[]` and by error responses.
 *
 * `toApiIssueItem` projects both rendered issues and legacy issues to this
 * shape. Extra fields on `ValidationIssue` (`name`, `defaultSeverity`) are
 * deliberately not projected.
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
    type: ApiEntityRef,
    required: false,
  })
  impactedEntity?: ApiEntityRef;

  @ApiProperty({
    description: 'Use cases affected by this issue, if any.',
    type: [ApiEntityRef],
    required: false,
  })
  impactedUsecases?: ApiEntityRef[];

  @ApiPropertyOptional({
    description: RELATED_ENTITIES_DESCRIPTION,
    type: 'object',
    additionalProperties: true,
  })
  relatedEntities?: ApiRelatedEntities;

  @ApiPropertyOptional({
    description: ISSUE_PARAMS_DESCRIPTION,
    type: 'object',
    additionalProperties: {oneOf: [{type: 'string'}, {type: 'number'}]},
  })
  params?: ApiIssueParams;

  @ApiProperty({
    description: 'Client-actionable fix options, if any.',
    type: [ApiFixOptionDto],
    required: false,
  })
  fixOptions?: ApiFixOptionDto[];
}
