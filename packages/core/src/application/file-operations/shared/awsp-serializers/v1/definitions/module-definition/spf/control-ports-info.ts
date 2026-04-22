/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Expose, Type} from 'class-transformer';
import {IsArray, IsOptional, ValidateNested} from 'class-validator';
import {AwspStaticControlPort} from './static-control-port.js';
import {AwspIntent} from './intent.js';

/**
 * Represents control ports information with static ports and dynamic intents.
 */
export class AwspControlPortsInfo {
  /** List of static control ports (optional) */
  @Expose()
  @IsOptional()
  @IsArray()
  @ValidateNested({each: true})
  @Type(() => AwspStaticControlPort)
  staticPorts?: AwspStaticControlPort[];

  /** List of dynamic intents (optional) */
  @Expose()
  @IsOptional()
  @IsArray()
  @ValidateNested({each: true})
  @Type(() => AwspIntent)
  dynamicIntents?: AwspIntent[];
}
