/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {ComponentsResponseDto} from './component-collection-response.dto.js';
import {SubsystemResponseDto} from '../../modules/subsystem/dto/subsystem.dto.js';

/**
 * DTO containing a collection of components with subsystem hierarchy.
 * Extends ComponentsResponseDto to include subsystem structure.
 * Used when hierarchical organization of components by subsystems is needed.
 */
export class ComponentsWithSubsystemsResponseDto extends ComponentsResponseDto {
  @ApiProperty({
    description: 'Hierarchical subsystem structure with nested components',
    type: () => SubsystemResponseDto,
    required: false,
    isArray: true,
  })
  subsystems?: SubsystemResponseDto[];

  constructor() {
    super();
    this.subsystems = [];
  }
}
