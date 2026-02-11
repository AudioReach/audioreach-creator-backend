/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Expose} from 'class-transformer';
import {IsNotEmpty, IsNumber, IsString} from 'class-validator';

/**
 * Represents a processor definition with basic processor information.
 */
export class ProcessorDefinition {
  /** Processor identifier (required) */
  @Expose()
  @IsNotEmpty()
  @IsNumber()
  id!: number;

  /** Processor name (required) */
  @Expose()
  @IsNotEmpty()
  @IsString()
  name!: string;
}
