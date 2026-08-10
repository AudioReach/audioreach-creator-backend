/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {BaseConnectableComponentDto} from '../../../common/dto/component.dto.js';
import {KeyInfoResponseDto} from '../../../common/dto/kv.dto.js';
import {ComponentCollectionWithSubsystemsDto} from '../../../common/dto/component-collection-with-subsystems.dto.js';

/**
 * Represents a subsystem DTO
 */
export class SubsystemDto extends BaseConnectableComponentDto {
  @ApiProperty({
    description: 'Filtered keys assigned to the subsystem',
    type: [KeyInfoResponseDto],
  })
  filteredKeys!: KeyInfoResponseDto[];

  @ApiProperty({
    description:
      'Child components within this subsystem (includes nested subsystems)',
    type: () => ComponentCollectionWithSubsystemsDto,
    required: false,
  })
  children?: ComponentCollectionWithSubsystemsDto;

  constructor(systemId: string, id: number, name: string, parentId?: number) {
    super(systemId, id);
    this.name = name;
    this.parentId = parentId;
    this.filteredKeys = [];
  }
}
