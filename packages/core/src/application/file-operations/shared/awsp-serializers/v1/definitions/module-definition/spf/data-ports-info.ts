/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Expose, Type} from 'class-transformer';
import {IsArray, IsNotEmpty, IsNumber, ValidateNested} from 'class-validator';
import {AwspPort} from './port.js';

/**
 * Represents data ports information with maximum ports and port list.
 */
export class AwspDataPortsInfo {
  /** Maximum number of ports (required) */
  @Expose()
  @IsNotEmpty()
  @IsNumber()
  maxPortCount!: number;

  /** List of ports (required) */
  @Expose()
  @IsArray()
  @ValidateNested({each: true})
  @Type(() => AwspPort)
  ports!: AwspPort[];
}
