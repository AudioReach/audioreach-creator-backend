/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Expose, Type} from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import type {VocoderModuleType} from '../type/vocoder-module-type.js';
import type {ModuleDirectionType} from '../type/module-direction-type.js';
import type {MdfModuleType} from '../type/mdf-module-type.js';
import type {MajorModuleType} from '../type/major-module-type.js';
import type {BuildType} from '../type/build-type.js';
import {DataPortsInfo} from './data-ports-info.js';
import {ControlPortsInfo} from './control-ports-info.js';
import {CustomModuleInfo} from './custom-module-info.js';
import {BaseModuleDefinition} from '../common/base-module-definition.js';

/**
 * Represents an SPF module definition with comprehensive module information.
 * Extends BaseModuleDefinition with SPF-specific properties.
 */
export class SpfModuleDefinition extends BaseModuleDefinition {
  /** List of supported processor IDs (required) */
  @Expose()
  @IsArray()
  @IsNumber({}, {each: true})
  supportedProcessorIds!: number[];

  /** Dictionary of supported container types (required) */
  @Expose()
  @IsArray()
  @IsNumber({}, {each: true})
  supportedContainerTypes!: number[];

  /** Input port information (optional) */
  @Expose()
  @IsOptional()
  @ValidateNested()
  @Type(() => DataPortsInfo)
  inputPortsInfo?: DataPortsInfo;

  /** Output ports information (optional) */
  @Expose()
  @IsOptional()
  @ValidateNested()
  @Type(() => DataPortsInfo)
  outputPortsInfo?: DataPortsInfo;

  /** Control ports information (optional) */
  @Expose()
  @IsOptional()
  @ValidateNested()
  @Type(() => ControlPortsInfo)
  controlPortsInfo?: ControlPortsInfo;

  /** Stack size (optional) */
  @Expose()
  @IsOptional()
  @IsNumber()
  stackSize?: number;

  /** Vocoder module type (optional) */
  @Expose()
  @IsOptional()
  vocoderModuleType?: VocoderModuleType;

  /** Direction type (optional) */
  @Expose()
  @IsOptional()
  directionType?: ModuleDirectionType;

  /** MDF module type (optional) */
  @Expose()
  @IsOptional()
  mdfModuleType?: MdfModuleType;

  /** Search keys (optional) */
  @Expose()
  @IsOptional()
  @IsString()
  searchKeys?: string;

  /** Indicates if module is offloadable (optional) */
  @Expose()
  @IsOptional()
  @IsBoolean()
  isOffloadable?: boolean;

  /** Indicates if module is built-in (optional) */
  @Expose()
  @IsOptional()
  @IsBoolean()
  builtIn?: boolean;

  /** Major module type (optional) */
  @Expose()
  @IsOptional()
  majorModuleType?: MajorModuleType;

  /** Build type (optional) */
  @Expose()
  @IsOptional()
  buildType?: BuildType;

  /** Indicates if module is island friendly (optional) */
  @Expose()
  @IsOptional()
  @IsBoolean()
  islandFriendly?: boolean;

  /** Custom module information (optional) */
  @Expose()
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomModuleInfo)
  customModuleInfo?: CustomModuleInfo;

  /** Group name (optional) */
  @Expose()
  @IsOptional()
  @IsString()
  groupName?: string;

  /** RTM log code (optional) */
  @Expose()
  @IsOptional()
  @IsString()
  rtmLogCode?: string;

  /** Indicates if module has neural network parameters (optional) */
  @Expose()
  @IsOptional()
  @IsBoolean()
  hasNeuralNetParam?: boolean;
}
