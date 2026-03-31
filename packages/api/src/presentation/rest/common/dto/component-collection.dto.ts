/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {SpfModuleDto} from '../../modules/spf-module/dto/shared/spf-module.dto.js';
import {DataLinkDto} from '../../modules/data-link/dto/data-link.dto.js';
import {ControlLinkDto} from '../../modules/control-link/dto/control-link.dto.js';

/**
 * DTO containing a collection of components in flat structure.
 * Contains modules, data links, and control links without subsystem hierarchy.
 * For hierarchical structure with subsystems, use ComponentCollectionWithSubsystemsDto.
 */
export class ComponentCollectionDto {
  @ApiProperty({
    description: 'List of SPF module instances',
    type: [SpfModuleDto],
  })
  spfModules: SpfModuleDto[];

  @ApiProperty({
    description: 'List of data links',
    type: [DataLinkDto],
  })
  dataLinks: DataLinkDto[];

  @ApiProperty({
    description: 'List of control links',
    type: [ControlLinkDto],
  })
  controlLinks: ControlLinkDto[];

  constructor() {
    this.spfModules = [];
    this.dataLinks = [];
    this.controlLinks = [];
  }
}
