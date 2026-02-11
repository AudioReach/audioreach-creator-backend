/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Expose} from 'class-transformer';
import {IsNotEmpty, IsNumber, IsString} from 'class-validator';

/**
 * Represents a container type with basic container type information.
 */
export class ContainerType {
  /** Container type identifier (required) */
  @Expose()
  @IsNotEmpty()
  @IsNumber()
  id!: number;

  /** Container type name (required) */
  @Expose()
  @IsNotEmpty()
  @IsString()
  name!: string;
}
