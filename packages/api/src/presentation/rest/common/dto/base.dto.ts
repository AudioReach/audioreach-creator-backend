/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

export const CHANGE_TYPE = {
  None: 'NONE',
  Create: 'CREATE',
  Update: 'UPDATE',
  Delete: 'DELETE',
} as const;

export type ChangeType = (typeof CHANGE_TYPE)[keyof typeof CHANGE_TYPE];

export const CHANGE_STATUS = {
  Staged: 'STAGED',
  Unstaged: 'UNSTAGED',
} as const;

export type ChangeStatus = (typeof CHANGE_STATUS)[keyof typeof CHANGE_STATUS];

export class ChangeInfoDto {
  @ApiProperty({
    description: 'Type of change operation applied to this resource',
    enum: CHANGE_TYPE,
  })
  changeType!: ChangeType;

  @ApiProperty({
    description:
      'Identifier of the change set this resource belongs to. Present only when changeType is not None.',
    required: false,
  })
  changeId?: string;

  @ApiProperty({
    description:
      'Change status of this resource. Present only when changeType is not None.',
    enum: CHANGE_STATUS,
    required: false,
  })
  changeStatus?: ChangeStatus;
}

/**
 * Abstract base class for all response DTOs.
 * Subclasses must declare `systemId` with their own @ApiProperty description.
 */
export abstract class BaseDto {
  /**
   * Subclasses must override this property and provide their own
   * @ApiProperty({ description: '...' }) decorator.
   */
  abstract systemId: string;

  @ApiProperty({
    description: 'Change information for this resource',
    type: ChangeInfoDto,
  })
  changeInfo!: ChangeInfoDto | undefined;
}
