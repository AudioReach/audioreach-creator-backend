/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {ComponentsWithSubsystemsResponseDto} from '../../../../common/dto/component-collection-with-subsystems.dto.js';

/**
 * Response DTO for move-in and move-out operations on a subsystem.
 *
 * - `added`: Components that moved (with updated parentId) plus any newly constructed links.
 * - `updated`: Entities that pre-existed and were modified by the move (e.g. subsystems whose
 *   children list or port wiring changed).
 * - `removed`: Links that were deleted because they became invalid after the move.
 *
 * Moved components always appear in `added` with their new parentId.
 * They do NOT appear in `removed`.
 */
export class MoveSubsystemComponentsResponseDto {
  @ApiProperty({
    description:
      'Components that were moved (with updated parentId) and any newly constructed links.',
    type: () => ComponentsWithSubsystemsResponseDto,
    required: false,
  })
  added?: ComponentsWithSubsystemsResponseDto;

  @ApiProperty({
    description:
      'Entities that pre-existed and were modified by the move ' +
      '(e.g. subsystems whose children list or port wiring changed).',
    type: () => ComponentsWithSubsystemsResponseDto,
    required: false,
  })
  updated?: ComponentsWithSubsystemsResponseDto;

  @ApiProperty({
    description:
      'Links that were removed because they became invalid after the move. ' +
      'Does not include the moved components themselves.',
    type: () => ComponentsWithSubsystemsResponseDto,
    required: false,
  })
  removed?: ComponentsWithSubsystemsResponseDto;
}
