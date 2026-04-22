/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Expose, Type} from 'class-transformer';
import {IsArray, ValidateNested} from 'class-validator';
import {AwspPort} from './port.js';
import {AwspIntent} from './intent.js';

/**
 * Represents a static control port with supported intents.
 * Extends Port with intent support.
 */
export class AwspStaticControlPort extends AwspPort {
  /** List of supported intents (required) */
  @Expose()
  @IsArray()
  @ValidateNested({each: true})
  @Type(() => AwspIntent)
  supportedIntents!: AwspIntent[];
}
