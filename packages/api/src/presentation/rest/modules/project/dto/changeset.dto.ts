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

// Apply-specific DTOs. An apply always processes every current staged action
// for the active session; callers cannot select individual change IDs.
export class CommitChangesRequestDto {}

export class CommitChangesResponseDto {
  @ApiProperty({description: 'Recorded session commit identifier'})
  commitId!: number;

  @ApiProperty({description: 'Number of physical rows applied'})
  appliedEntityCount!: number;

  @ApiProperty({description: 'Number of aggregates with physical mutations'})
  appliedAggregateCount!: number;
}

// Discard-specific DTOs. The empty request prevents selective discard from
// being reintroduced through the public API.
export class DiscardChangesRequestDto {}

export class DiscardChangesResponseDto {
  @ApiProperty({description: 'Number of edit-action rows removed'})
  discardedEditActionCount!: number;
}
