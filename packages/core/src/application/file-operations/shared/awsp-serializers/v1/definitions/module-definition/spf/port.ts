/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Expose} from 'class-transformer';
import {IsNotEmpty, IsNumber, IsOptional, IsString} from 'class-validator';

/**
 * Represents a port with identifier and name.
 */
export class AwspPort {
  /** Port identifier (required) */
  @Expose()
  @IsNotEmpty()
  @IsNumber()
  id!: number;

  /** Port name (optional) */
  @Expose()
  @IsOptional()
  @IsString()
  name?: string;
}
