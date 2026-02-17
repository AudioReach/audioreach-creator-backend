/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Expose} from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsArray,
  IsOptional,
} from 'class-validator';
import type {DefinitionElement} from '../common/element-types.js';

/**
 * Represents a base property definition with core identification and elements.
 */
export abstract class BasePropertyDefinition {
  /** Unique identifier for the property definition (required) */
  @Expose()
  @IsNotEmpty()
  @IsNumber()
  id!: number;

  /** Name of the property definition (required) */
  @Expose()
  @IsNotEmpty()
  @IsString()
  name!: string;

  /** Description of the property definition (optional) */
  @Expose()
  @IsOptional()
  @IsString()
  description?: string;

  /** Maximum size for the property (optional) */
  @Expose()
  @IsOptional()
  @IsNumber()
  maxSize?: number;

  /** List of element associated with this property (required) */
  @Expose()
  @IsArray()
  elements!: DefinitionElement[];
}
