/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {ComponentCollectionResponseDto} from './component-collection.dto.js';
import {SubsystemDto} from '../../modules/subsystem/dto/subsystem.dto.js';

/**
 * DTO containing a collection of components with subsystem hierarchy.
 * Extends ComponentCollectionDto to include subsystem structure.
 * Used when hierarchical organization of components by subsystems is needed.
 */
export class ComponentCollectionWithSubsystemsDto extends ComponentCollectionResponseDto {
  @ApiProperty({
    description: 'Hierarchical subsystem structure with nested components',
    type: () => SubsystemDto,
    required: false,
    isArray: true,
  })
  subsystems?: SubsystemDto[];

  constructor() {
    super();
    this.subsystems = [];
  }
}
