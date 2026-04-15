/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Expose, Type} from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import {AwspParamDefinition} from './param-definition.js';

/**
 * Abstract base class for module definitions.
 * Contains common properties shared between SPF and Driver module definitions.
 */
export abstract class BaseModuleDefinition {
  /** Module identifier (required) */
  @Expose()
  @IsNotEmpty()
  @IsNumber()
  id!: number;

  /** Module name (required) */
  @Expose()
  @IsNotEmpty()
  @IsString()
  name!: string;

  /** List of parameter definitions (required) */
  @Expose()
  @IsArray()
  @ValidateNested({each: true})
  @Type(() => AwspParamDefinition)
  paramDefinitions!: AwspParamDefinition[];

  /** Display name (optional) */
  @Expose()
  @IsOptional()
  @IsString()
  displayName?: string;

  /** Module description (optional) */
  @Expose()
  @IsOptional()
  @IsString()
  description?: string;

  /** ID of module that replaces this one (optional) */
  @Expose()
  @IsOptional()
  @IsNumber()
  replacedBy?: number;

  /** Indicates if module is deprecated (optional) */
  @Expose()
  @IsOptional()
  @IsBoolean()
  deprecated?: boolean;
}
