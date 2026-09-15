/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {createZodDto} from 'nestjs-zod';
import type {RoutingOutcome, UsecaseChangeDetails} from '@arc/core';
import {
  mapUsecaseChangeDetails,
  UsecaseChangeDetailsDtoSchema,
} from '@arc/core';
import {ApiIssueItem} from '../../../common/dto/api-response/api-issue-item.dto.js';
import {toApiIssueItems} from '../../../common/dto/api-response/api-issue-item.mapper.js';

export class UsecaseChangeDetailsDto extends createZodDto(
  UsecaseChangeDetailsDtoSchema,
) {}

export class CreateUsecasesResponseDto {
  @ApiProperty({type: [UsecaseChangeDetailsDto]})
  changes!: UsecaseChangeDetailsDto[];

  @ApiProperty({type: [ApiIssueItem]})
  issues!: ApiIssueItem[];

  @ApiProperty()
  groupId!: string;
}

export class CreateManualUsecasesResponseDto extends CreateUsecasesResponseDto {}

export function mapCreateUsecasesResponse(
  outcome: RoutingOutcome,
  changes: readonly UsecaseChangeDetails[],
): CreateUsecasesResponseDto {
  return {
    changes: changes.map(change => mapUsecaseChangeDetails(change)),
    issues: toApiIssueItems(outcome.issues) ?? [],
    groupId: outcome.groupId,
  };
}
