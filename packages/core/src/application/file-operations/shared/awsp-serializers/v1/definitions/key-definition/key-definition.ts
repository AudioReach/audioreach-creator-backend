/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Expose, Type} from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsArray,
  ValidateNested,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import {AwspValueDefinition} from './value-definition.js';
import type {SpecialKey} from './type/special-key-type.js';

/**
 * Represents a key definition with identifier, name, and associated values.
 */
export class AwspKeyDefinition {
  /** Unique identifier for the key definition */
  @Expose()
  @IsNotEmpty()
  @IsNumber()
  id!: number;

  /** Name of the key definition */
  @Expose()
  @IsNotEmpty()
  @IsString()
  name!: string;

  /** List of value definitions associated with this key */
  @Expose()
  @IsArray()
  @ValidateNested({each: true})
  @Type(() => AwspValueDefinition)
  values!: AwspValueDefinition[];

  /** Optional description providing additional details about the key definition */
  @Expose()
  @IsOptional()
  @IsString()
  description?: string;

  /** Optional flag indicating if this is a voice key */
  @Expose()
  @IsOptional()
  @IsBoolean()
  isVoice?: boolean;

  /** Optional flag indicating if this is a dynamic key */
  @Expose()
  @IsOptional()
  @IsBoolean()
  isDynamic?: boolean;

  /** Special key type classification */
  @Expose()
  @IsOptional()
  specialty?: SpecialKey;

  /** Optional enumeration value associated with the key definition */
  @Expose()
  @IsOptional()
  @IsString()
  enumValue?: string;

  /** Optional enumeration name associated with the key definition */
  @Expose()
  @IsOptional()
  @IsString()
  enumName?: string;

  /** Optional flag indicating if this is a graph key */
  @Expose()
  @IsOptional()
  @IsBoolean()
  isGraphKey?: boolean;

  /** Optional graph key enumeration value */
  @Expose()
  @IsOptional()
  @IsString()
  graphKeyEnumValue?: string;

  /** Optional flag indicating if this is a calibration key */
  @Expose()
  @IsOptional()
  @IsBoolean()
  isCalKey?: boolean;

  /** Optional calibration key enumeration value */
  @Expose()
  @IsOptional()
  @IsString()
  calKeyEnumValue?: string;
}
