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

export class ChangesetResponseDto {
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

export class StageChangesResponseDto extends ChangesetResponseDto {
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

export class UnstageChangesResponseDto extends ChangesetResponseDto {
  @ApiProperty({description: 'Successfully unstaged change IDs'})
  declare processedChangeIds: string[];

  @ApiProperty({description: 'Change IDs that failed to unstage'})
  declare failedChangeIds: string[];
}

// Commit-specific DTOs
export class CommitChangesRequestDto {
  @ApiProperty({
    description:
      'Optional array of change IDs to commit. If not provided, all staged changes will be committed.',
    type: [String],
    required: false,
  })
  @IsArray()
  @IsString({each: true})
  changeIds?: string[];
}

export class CommitChangesResponseDto extends ChangesetResponseDto {
  @ApiProperty({description: 'Successfully committed change IDs'})
  declare processedChangeIds: string[];

  @ApiProperty({description: 'Change IDs that failed to commit'})
  declare failedChangeIds: string[];

  @ApiProperty({
    description: 'Change IDs that were missing required dependencies',
    type: [String],
    required: false,
  })
  missingDependencies?: string[];
}

// Discard-specific DTOs
export class DiscardChangesRequestDto {
  @ApiProperty({
    description:
      'Optional array of change IDs to discard. If not provided, all changes will be discarded.',
    type: [String],
    required: false,
  })
  @IsArray()
  @IsString({each: true})
  changeIds?: string[];
}

export class DiscardChangesResponseDto extends ChangesetResponseDto {
  @ApiProperty({description: 'Successfully discarded change IDs'})
  declare processedChangeIds: string[];

  @ApiProperty({description: 'Change IDs that failed to discard'})
  declare failedChangeIds: string[];

  @ApiProperty({
    description: 'Change IDs that were discarded due to dependency cascade',
    type: [String],
  })
  cascadedChangeIds!: string[];
}
