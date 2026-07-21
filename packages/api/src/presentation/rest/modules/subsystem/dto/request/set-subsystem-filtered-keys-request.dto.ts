/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsArray, IsString} from 'class-validator';

/**
 * Request DTO for setting the filtered keys on a subsystem.
 * This is a full replacement — the provided list becomes the new set of filtered keys.
 * An empty array is valid and clears all filtered keys.
 */
export class SetSubsystemFilteredKeysRequestDto {
  @ApiProperty({
    type: [String],
    description:
      'System IDs of the key definitions to assign as filtered keys. ' +
      'Replaces the current set. Pass an empty array to clear all filtered keys.',
  })
  @IsArray()
  @IsString({each: true})
  keySystemIds!: string[];
}
