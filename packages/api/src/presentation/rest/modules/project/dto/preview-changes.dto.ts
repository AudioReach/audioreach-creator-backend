/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {UsecaseResponseDto} from '../../usecase/dto/usecase-response.dto.js';
import {KeyDefinitionResponseDto} from '../../definition/key-definition/dto/key-definition-response.dto.js';
import {SpfModuleDefinitionResponseDto} from '../../definition/module-definition/dto/spf-module-definition-response.dto.js';
import {DriverModuleDefinitionResponseDto} from '../../definition/module-definition/dto/driver-module-definition-response.dto.js';
import {SpfPropertyDefinitionDto} from '../../definition/property-definition/dto/spf-property-definition.dto.js';
import {DriverPropertyDefinitionDto} from '../../definition/property-definition/dto/driver-property-definition.dto.js';
import {DriverModuleDto} from '../../driver-data/dto/driver-module.dto.js';
import {CustomModuleDto} from '../../module-manager/dto/custom-module.dto.js';
import {UsecaseCategoryDto} from '../../metadata/usecase-category/dto/usecase-category.dto.js';
import {UsecaseAliasDto} from '../../metadata/usecase-alias/dto/usecase-alias.dto.js';

/**
 * DTO representing a unique change that affected multiple usecases
 */
export class UniqueChangeDto {
  @ApiProperty({description: 'Unique identifier for this change type'})
  changeId!: string;

  @ApiProperty({description: 'Description of the change'})
  description!: string;

  @ApiProperty({
    type: [String],
    description: 'System IDs of usecases that have this change',
  })
  affectedUsecaseSystemIds!: string[];

  @ApiProperty({description: 'Number of usecases affected by this change'})
  affectedUsecaseCount!: number;
}

/**
 * DTO containing usecase changes information
 */
export class UsecaseActionsDto {
  @ApiProperty({type: [UsecaseResponseDto], description: 'Added usecases'})
  added!: UsecaseResponseDto[];

  @ApiProperty({type: [UsecaseResponseDto], description: 'Updated usecases'})
  updated!: UsecaseResponseDto[];

  @ApiProperty({type: [UsecaseResponseDto], description: 'Deleted usecases'})
  deleted!: UsecaseResponseDto[];

  @ApiProperty({
    type: [UniqueChangeDto],
    description: 'Unique changes that affected the updated usecases',
  })
  uniqueChanges!: UniqueChangeDto[];
}

/**
 * DTO containing definition changes information
 */
export class DefinitionActionsDto {
  @ApiProperty({description: 'Key definition changes'})
  keys!: {
    added: KeyDefinitionResponseDto[];
    updated: KeyDefinitionResponseDto[];
    deleted: KeyDefinitionResponseDto[];
  };

  @ApiProperty({description: 'SPF Module definition changes'})
  spfModules!: {
    added: SpfModuleDefinitionResponseDto[];
    updated: SpfModuleDefinitionResponseDto[];
    deleted: SpfModuleDefinitionResponseDto[];
  };

  @ApiProperty({description: 'Driver Module definition changes'})
  driverModules!: {
    added: DriverModuleDefinitionResponseDto[];
    updated: DriverModuleDefinitionResponseDto[];
    deleted: DriverModuleDefinitionResponseDto[];
  };

  @ApiProperty({description: 'SPF Property definition changes'})
  spfProperties!: {
    added: SpfPropertyDefinitionDto[];
    updated: SpfPropertyDefinitionDto[];
    deleted: SpfPropertyDefinitionDto[];
  };

  @ApiProperty({description: 'Driver Property definition changes'})
  driverProperties!: {
    added: DriverPropertyDefinitionDto[];
    updated: DriverPropertyDefinitionDto[];
    deleted: DriverPropertyDefinitionDto[];
  };
}

/**
 * DTO containing Module Manager (AMDB) custom module changes
 */
export class ModuleManagerActionsDto {
  @ApiProperty({
    type: [CustomModuleDto],
    description: 'Added custom modules',
  })
  added!: CustomModuleDto[];

  @ApiProperty({
    type: [CustomModuleDto],
    description: 'Updated custom modules',
  })
  updated!: CustomModuleDto[];

  @ApiProperty({
    type: [CustomModuleDto],
    description: 'Deleted custom modules',
  })
  deleted!: CustomModuleDto[];
}

/**
 * DTO containing driver module data changes
 */
export class DriverModuleDataActionsDto {
  @ApiProperty({
    type: [DriverModuleDto],
    description: 'Added driver modules',
  })
  added!: DriverModuleDto[];

  @ApiProperty({
    type: [DriverModuleDto],
    description: 'Updated driver modules',
  })
  updated!: DriverModuleDto[];

  @ApiProperty({
    type: [DriverModuleDto],
    description: 'Deleted driver modules',
  })
  deleted!: DriverModuleDto[];
}

/**
 * DTO containing metadata changes (categories and aliases)
 */
export class MetaDataActionsDto {
  @ApiProperty({
    description: 'Usecase category changes',
  })
  usecaseCategories!: {
    added: UsecaseCategoryDto[];
    updated: UsecaseCategoryDto[];
    deleted: UsecaseCategoryDto[];
  };

  @ApiProperty({
    description: 'Usecase alias changes',
  })
  usecaseAliases!: {
    added: UsecaseAliasDto[];
    updated: UsecaseAliasDto[];
    deleted: UsecaseAliasDto[];
  };
}

/**
 * Main response DTO for preview-changes API
 */
export class PreviewChangesResponseDto {
  @ApiProperty({
    type: UsecaseActionsDto,
    description: 'Usecase changes',
  })
  usecaseData!: UsecaseActionsDto;

  @ApiProperty({
    type: DefinitionActionsDto,
    description: 'Definition changes',
  })
  definitions!: DefinitionActionsDto;

  @ApiProperty({
    type: ModuleManagerActionsDto,
    description: 'Module Manager custom module changes',
  })
  moduleManager!: ModuleManagerActionsDto;

  @ApiProperty({
    type: DriverModuleDataActionsDto,
    description: 'Driver module data changes',
  })
  driverModuleData!: DriverModuleDataActionsDto;

  @ApiProperty({
    type: MetaDataActionsDto,
    description: 'Metadata changes (categories and aliases)',
  })
  metadata!: MetaDataActionsDto;
}
