/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {
  CkvResponseDto,
  ParamInfoResponseDto,
} from '../shared/tuning-config.dto.js';

/**
 * Response DTO for CKV parameter operations.
 * Returns the list of parameters that support CALIBRATION for the module.
 */
export class CkvParametersResponseDto {
  @ApiProperty({
    description: 'Array of parameters that support CALIBRATION for this module',
    type: [ParamInfoResponseDto],
  })
  parameters!: ParamInfoResponseDto[];
}

/**
 * Single entry mapping one TKV to its supported parameters.
 */
export class TkvParameterItem {
  @ApiProperty({
    description: 'TKV system ID',
    type: String,
  })
  tkvSystemId!: string;

  @ApiProperty({
    description: 'Parameters supported by this TKV',
    type: [ParamInfoResponseDto],
  })
  parameters!: ParamInfoResponseDto[];
}

/**
 * Response DTO for TKV parameter GET operations.
 * Returns a list of TKV system IDs paired with their supported parameters.
 */
export class TkvParametersResponseDto {
  @ApiProperty({
    description: 'List of TKV system IDs with their supported parameter lists',
    type: [TkvParameterItem],
  })
  tkvParameters!: TkvParameterItem[];
}

/**
 * Response DTO for CKV parameter removal operations.
 * Returns information about which parameters were removed and which CKVs were affected.
 */
export class CkvParameterRemovalResponseDto {
  @ApiProperty({
    description: 'Array of parameter system IDs that were removed',
    type: [Number],
  })
  removedParameterSystemIds!: number[];

  @ApiProperty({
    description:
      'Array of CKV system IDs that were deleted because their last parameter was removed. ' +
      'Empty array if no CKVs were deleted.',
    type: [String],
  })
  removedCkvSystemIds!: string[];

  @ApiProperty({
    description:
      'Array of CKV system IDs that still exist but had the parameter stripped from them.',
    type: [String],
  })
  affectedCkvSystemIds!: string[];
}

/**
 * Single TKV parameter removal result item.
 */
export class TkvParameterRemovalItem {
  @ApiProperty({
    description: 'TKV system ID that was updated',
    type: String,
  })
  tkvSystemId!: string;

  @ApiProperty({
    description:
      'Array of parameter system IDs that were removed from this TKV',
    type: [Number],
  })
  removedParameterSystemIds!: number[];
}

/**
 * Response DTO for TKV parameter removal operations.
 * Returns information about which parameters were removed from which TKVs.
 */
export class TkvParameterRemovalResponseDto {
  @ApiProperty({
    description: 'Array of TKV parameter removal results',
    type: [TkvParameterRemovalItem],
  })
  updates!: TkvParameterRemovalItem[];
}

/**
 * Response DTO for adding CKVs to an SPF module.
 * Returns the created calibration bins and any CKVs removed as a domain side effect
 * (e.g. the zero placeholder CKV is removed when the first real CKV is added).
 */
export class AddCkvsResponseDto {
  @ApiProperty({
    description: 'Array of CKVs that were created',
    type: [CkvResponseDto],
  })
  addedCkvs!: CkvResponseDto[];

  @ApiProperty({
    description:
      'Array of CKV system IDs that were implicitly removed as a side effect ' +
      '(e.g. zero placeholder CKV). Empty array if no CKVs were removed.',
    type: [String],
  })
  removedCkvSystemIds!: string[];
}

/**
 * Response DTO for deleting an SPF module.
 * Returns the module system ID and any container or subgraph that was cascade-deleted
 * because the module was the last one in its container.
 */
export class RemoveSpfModuleResponseDto {
  @ApiProperty({
    description: 'System ID of the deleted SPF module',
    type: String,
  })
  removedModuleSystemId!: string;

  @ApiProperty({
    description:
      'System ID of the container that was cascade-deleted because this was its last module. ' +
      'Absent if the container still exists.',
    type: String,
    required: false,
  })
  removedContainerSystemId?: string;

  @ApiProperty({
    description:
      'System ID of the subgraph that was cascade-deleted because this was its last module. ' +
      'Absent if the subgraph still exists.',
    type: String,
    required: false,
  })
  removedSubgraphSystemId?: string;
}
