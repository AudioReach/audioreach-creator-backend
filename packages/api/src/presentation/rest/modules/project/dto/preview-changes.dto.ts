/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {UsecaseResponseDto} from '../../usecase/dto/usecase-response.dto.js';
import {KeyDefinitionResponseDto} from '../../definition/key-definition/dto/key-definition-response.dto.js';
import {SpfModuleDefinitionResponseDto} from '../../definition/module-definition/dto/spf-module-definition-response.dto.js';
import {DriverModuleDefinitionResponseDto} from '../../definition/module-definition/dto/driver-module-definition-response.dto.js';

// ── Inlined DTOs (used only in this file) ────────────────────────────────────

class SpfPropertyDto {
  @ApiProperty({description: 'Property ID'})
  id!: string;

  @ApiProperty({description: 'Property name'})
  name!: string;

  @ApiProperty({description: 'Maximum size in bytes'})
  maxSize!: string;

  @ApiProperty({description: 'Voice property flag', required: false})
  isVoice?: boolean;

  @ApiProperty({description: 'Property description'})
  description!: string;
}

class SpfPropertyDefinitionDto {
  @ApiProperty({description: 'Property category ID'})
  propCategoryID!: string;

  @ApiProperty({description: 'Property category name'})
  propCategoryName!: string;

  @ApiProperty({
    type: [SpfPropertyDto],
    description: 'List of properties in this category',
  })
  properties!: SpfPropertyDto[];
}

class DriverPropertyDto {
  @ApiProperty({description: 'Property ID'})
  id!: string;

  @ApiProperty({description: 'Property name'})
  name!: string;

  @ApiProperty({description: 'Maximum size in bytes'})
  maxSize!: string;

  @ApiProperty({description: 'Voice property flag', required: false})
  isVoice?: boolean;

  @ApiProperty({description: 'Property description'})
  description!: string;
}

class DriverPropertyDefinitionDto {
  @ApiProperty({
    type: [DriverPropertyDto],
    description: 'List of driver properties',
  })
  properties!: DriverPropertyDto[];
}

class DriverModuleCalDataDto {
  @ApiProperty({description: 'Calibration key vector'})
  ckv!: string;

  @ApiProperty({description: 'Parameter ID'})
  pid!: string;

  @ApiProperty({description: 'Parameter name'})
  name!: string;

  @ApiProperty({description: 'Calibration data structure'})
  calData!: Record<string, unknown>;
}

class DriverModuleCalDto {
  @ApiProperty({description: 'Module ID'})
  mid!: string;

  @ApiProperty({description: 'Module name'})
  name!: string;

  @ApiProperty({
    type: [DriverModuleCalDataDto],
    description: 'Calibration data for this driver module',
  })
  calData!: DriverModuleCalDataDto[];
}

class CustomModuleDto {
  @ApiProperty({description: 'Processor ID'})
  procId!: string;

  @ApiProperty({description: 'Module ID'})
  id!: string;

  @ApiProperty({description: 'Interface type'})
  interfaceType!: string;

  @ApiProperty({description: 'Interface version'})
  interfaceVersion!: string;

  @ApiProperty({description: 'Module type'})
  moduleType!: string;

  @ApiProperty({description: 'File name'})
  fileName!: string;

  @ApiProperty({description: 'Module tag'})
  tag!: string;

  @ApiProperty({description: 'Error code'})
  errorCode!: string;

  @ApiProperty({description: 'Display name', required: false})
  displayName?: string;
}

class PreviewUsecaseCategoryDto {
  @ApiProperty({description: 'Usecase category name'})
  usecaseCategory!: string;

  @ApiProperty({
    description: 'Previous category name (for updates)',
    required: false,
  })
  oldUsecaseCategory?: string;

  @ApiProperty({description: 'Sort order for display', required: false})
  sortOrder?: string;

  @ApiProperty({
    type: [String],
    description: 'Array of usecase system IDs in this category',
  })
  usecases!: string[];
}

class PreviewUsecaseAliasDto {
  @ApiProperty({description: 'Usecase identifier'})
  usecase!: string;

  @ApiProperty({description: 'Usecase alias name'})
  usecaseAlias!: string;

  @ApiProperty({description: 'Usecase ID'})
  usecaseId!: string;

  @ApiProperty({
    description: 'Previous alias name (for updates)',
    required: false,
  })
  oldUsecaseAlias?: string;

  @ApiProperty({
    description: 'Previous usecase ID (for updates)',
    required: false,
  })
  oldUsecaseId?: string;
}

// ── Public DTOs ───────────────────────────────────────────────────────────────

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
  @ApiProperty({type: [CustomModuleDto], description: 'Added custom modules'})
  added!: CustomModuleDto[];

  @ApiProperty({type: [CustomModuleDto], description: 'Updated custom modules'})
  updated!: CustomModuleDto[];

  @ApiProperty({type: [CustomModuleDto], description: 'Deleted custom modules'})
  deleted!: CustomModuleDto[];
}

/**
 * DTO containing driver module data changes
 */
export class DriverModuleDataActionsDto {
  @ApiProperty({
    type: [DriverModuleCalDto],
    description: 'Added driver modules',
  })
  added!: DriverModuleCalDto[];

  @ApiProperty({
    type: [DriverModuleCalDto],
    description: 'Updated driver modules',
  })
  updated!: DriverModuleCalDto[];

  @ApiProperty({
    type: [DriverModuleCalDto],
    description: 'Deleted driver modules',
  })
  deleted!: DriverModuleCalDto[];
}

/**
 * DTO containing metadata changes (categories and aliases)
 */
export class MetaDataActionsDto {
  @ApiProperty({description: 'Usecase category changes'})
  usecaseCategories!: {
    added: PreviewUsecaseCategoryDto[];
    updated: PreviewUsecaseCategoryDto[];
    deleted: PreviewUsecaseCategoryDto[];
  };

  @ApiProperty({description: 'Usecase alias changes'})
  usecaseAliases!: {
    added: PreviewUsecaseAliasDto[];
    updated: PreviewUsecaseAliasDto[];
    deleted: PreviewUsecaseAliasDto[];
  };
}

/**
 * Main response DTO for preview-changes API
 */
export class PreviewChangesResponseDto {
  @ApiProperty({type: UsecaseActionsDto, description: 'Usecase changes'})
  usecaseData!: UsecaseActionsDto;

  @ApiProperty({type: DefinitionActionsDto, description: 'Definition changes'})
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
