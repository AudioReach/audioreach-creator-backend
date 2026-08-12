/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {BaseConnectableComponentDto} from '../../../common/dto/base-connectable-component.dto.js';
import {KeyInfoDto} from '../../../common/dto/kv-info.dto.js';
import {ComponentsWithSubsystemsResponseDto} from '../../../common/dto/component-collection-with-subsystems.dto.js';

/**
 * Represents a subsystem DTO
 */
export class SubsystemResponseDto extends BaseConnectableComponentDto {
  @ApiProperty({
    description: 'Filtered keys assigned to the subsystem',
    type: [KeyInfoDto],
  })
  filteredKeys!: KeyInfoDto[];

  @ApiProperty({
    description:
      'Child components within this subsystem (includes nested subsystems)',
    type: () => ComponentsWithSubsystemsResponseDto,
    required: false,
  })
  children?: ComponentsWithSubsystemsResponseDto;

  constructor(systemId: string, id: number, name: string, parentId?: number) {
    super(systemId, id);
    this.name = name;
    this.parentId = parentId;
    this.filteredKeys = [];
  }
}
