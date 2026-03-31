/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {UsecaseIdentifierDto} from './usecase.dto.js';
import {ComponentCollectionWithSubsystemsDto} from '../../../common/dto/component-collection-with-subsystems.dto.js';

/**
 * DTO for usecase components API response with subsystem hierarchy.
 * Contains usecase identifiers and their associated component collection organized by subsystems.
 */
export class UsecaseComponentsWithSubsystemsDto {
  @ApiProperty({
    description: 'Array of usecase identifiers that these components belong to',
    type: [UsecaseIdentifierDto],
  })
  usecaseIdentifiers: UsecaseIdentifierDto[];

  @ApiProperty({
    description:
      'Collection of all components for the specified usecases with subsystem hierarchy',
    type: () => ComponentCollectionWithSubsystemsDto,
  })
  components: ComponentCollectionWithSubsystemsDto;

  constructor(
    usecaseIdentifiers: UsecaseIdentifierDto[],
    components: ComponentCollectionWithSubsystemsDto,
  ) {
    this.usecaseIdentifiers = usecaseIdentifiers;
    this.components = components;
  }
}
