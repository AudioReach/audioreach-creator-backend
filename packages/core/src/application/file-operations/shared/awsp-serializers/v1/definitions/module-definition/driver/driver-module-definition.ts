/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Expose} from 'class-transformer';
import {IsBoolean, IsOptional} from 'class-validator';
import {BaseModuleDefinition} from '../common/base-module-definition.js';

/**
 * Represents a driver module definition.
 * Extends BaseModuleDefinition with driver-specific properties.
 */
export class DriverModuleDefinition extends BaseModuleDefinition {
  /** Indicates if module is stubbed (optional) */
  @Expose()
  @IsOptional()
  @IsBoolean()
  stubbed?: boolean;
}
