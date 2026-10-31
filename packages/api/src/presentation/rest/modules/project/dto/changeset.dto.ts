/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsArray, ArrayNotEmpty} from 'class-validator';
import {createZodDto} from 'nestjs-zod';
import {UsecaseChangesetResultSchema} from '@arc/core';

// Base DTOs
export class ChangesetRequestDto {
  @ApiProperty({
    description: 'System IDs of the entities to stage/unstage',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  systemIds!: string[];
}

// Stage-specific DTOs
export class StageUsecasesRequestDto extends ChangesetRequestDto {}

export class StageUsecasesResponseDto extends createZodDto(
  UsecaseChangesetResultSchema,
) {}

// Unstage-specific DTOs
export class UnstageUsecasesRequestDto extends ChangesetRequestDto {}

export class UnstageUsecasesResponseDto extends createZodDto(
  UsecaseChangesetResultSchema,
) {}

// Commit-specific DTOs
// Commit always applies every staged action in the active session, so callers
// cannot provide a selective change-ID request payload.
export class CommitChangesRequestDto {}

// A successful commit is represented by HTTP 200 with an empty response body.
export class CommitChangesResponseDto {}

// Discard-specific DTOs
// Discard clears every edit action in the active session, so callers cannot
// provide a selective change-ID request payload.
export class DiscardChangesRequestDto {}

// A successful discard is represented by HTTP 200 with an empty response body.
export class DiscardChangesResponseDto {}
