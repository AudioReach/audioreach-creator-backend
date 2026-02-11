/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Expose, Type} from 'class-transformer';
import {IsArray, IsOptional, ValidateNested} from 'class-validator';
import {StaticControlPort} from './static-control-port.js';
import {Intent} from './intent.js';

/**
 * Represents control ports information with static ports and dynamic intents.
 */
export class ControlPortsInfo {
  /** List of static control ports (optional) */
  @Expose()
  @IsOptional()
  @IsArray()
  @ValidateNested({each: true})
  @Type(() => StaticControlPort)
  staticPorts?: StaticControlPort[];

  /** List of dynamic intents (optional) */
  @Expose()
  @IsOptional()
  @IsArray()
  @ValidateNested({each: true})
  @Type(() => Intent)
  dynamicIntents?: Intent[];
}
