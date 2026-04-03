/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {ModuleInfo} from '../info/module-info.js';
import {BaseModuleDefinitionDto} from './base-module-definition.dto.js';
import {SpfCustomModuleMetadataDto} from './spf-custom-module-metadata.dto.js';
import {ProcessorInfo} from '../info/processor-info.js';
import {VocoderModuleType} from '../enums/vocoder-module-type.js';
import {ModuleDirectionType} from '../enums/module-direction-type.enum.js';
export class SpfModuleDefinitionResponseDto extends BaseModuleDefinitionDto {
  @ApiProperty({description: 'Processor information'})
  processorInfo!: ProcessorInfo;

  // @ApiProperty({ description: 'Group name the module belongs to' })
  // groupName!: string;

  // @ApiProperty({ description: 'Optional RTM log code', required: false })
  // rtmLogCode?: string;

  // @ApiProperty({ description: 'Indicates if the module has neural net parameters' })
  // hasNeuralNetParam!: boolean;

  @ApiProperty({description: 'Search keys for the module'})
  modSearchKeys!: string;

  @ApiProperty({
    description: 'Indicates if the module is offloadable',
    required: false,
  })
  isOffloadable?: boolean;

  @ApiProperty({description: 'Indicates if the module is built‑in'})
  builtIn!: boolean;

  @ApiProperty({description: 'Vocoder module type', enum: VocoderModuleType})
  vocoderModuleType?: VocoderModuleType;

  @ApiProperty({
    description: 'Direction type of the module',
    enum: ModuleDirectionType,
  })
  moduleDirectionType?: ModuleDirectionType;

  // @ApiProperty({ description: 'Indicates if the module was newly added' })
  // newlyAdded!: boolean;

  @ApiProperty({description: 'Module information', type: ModuleInfo})
  moduleInfo!: ModuleInfo;

  @ApiProperty({description: 'Indicates if the module is loaded at bootup'})
  isLoadedAtBootup!: boolean;

  @ApiProperty({description: 'Indicates if the module is a custom module'})
  isCustomModule!: boolean;

  @ApiProperty({
    description: 'Custom module data',
    type: SpfCustomModuleMetadataDto,
    required: false,
    nullable: true,
  })
  customModuleData?: SpfCustomModuleMetadataDto | null;
}
