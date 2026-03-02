/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {ChangeType} from '../enums/change-type.enum.js';
import {ChangeStatus} from '../enums/change-status.enum.js';

export class ChangeInfoDto {
  @ApiProperty({
    description: 'Type of change operation applied to this resource',
    enum: ChangeType,
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
    enum: ChangeStatus,
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
  changeInfo!: ChangeInfoDto;
}
