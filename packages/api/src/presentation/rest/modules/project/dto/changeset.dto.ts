/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsArray, ArrayNotEmpty, IsString} from 'class-validator';

// Base DTOs
export class ChangesetRequestDto {
  @ApiProperty({description: 'Array of change IDs to process', type: [String]})
  @IsArray()
  @ArrayNotEmpty()
  @IsString({each: true})
  changeIds!: string[];
}

export class ChangesetDto {
  @ApiProperty({description: 'Overall operation success status'})
  success!: boolean;

  @ApiProperty({
    description: 'Successfully processed change IDs',
    type: [String],
  })
  processedChangeIds!: string[];

  @ApiProperty({
    description: 'Change IDs that failed to process',
    type: [String],
  })
  failedChangeIds!: string[];

  @ApiProperty({description: 'Descriptive message about the operation'})
  message!: string;
}

// Stage-specific DTOs
export class StageChangesRequestDto extends ChangesetRequestDto {
  @ApiProperty({description: 'Array of change IDs to stage'})
  declare changeIds: string[];
}

export class StageChangesResponseDto extends ChangesetDto {
  @ApiProperty({description: 'Successfully staged change IDs'})
  declare processedChangeIds: string[];

  @ApiProperty({description: 'Change IDs that failed to stage'})
  declare failedChangeIds: string[];
}

// Unstage-specific DTOs
export class UnstageChangesRequestDto extends ChangesetRequestDto {
  @ApiProperty({description: 'Array of change IDs to unstage'})
  declare changeIds: string[];
}

export class UnstageChangesResponseDto extends ChangesetDto {
  @ApiProperty({description: 'Successfully unstaged change IDs'})
  declare processedChangeIds: string[];

  @ApiProperty({description: 'Change IDs that failed to unstage'})
  declare failedChangeIds: string[];
}

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
