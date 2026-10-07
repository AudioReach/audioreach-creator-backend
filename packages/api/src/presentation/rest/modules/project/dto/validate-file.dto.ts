/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsEnum, IsOptional} from 'class-validator';
import {VALIDATION_RULE_GROUP, type ValidationRuleGroup} from '@arc/core';

export class ValidateFileRequestDto {
  @ApiProperty({
    description: 'Rule group to run. Defaults to SAVE_FILE when omitted.',
    enum: VALIDATION_RULE_GROUP,
    enumName: 'ValidationRuleGroup',
    required: false,
  })
  @IsOptional()
  @IsEnum(VALIDATION_RULE_GROUP)
  group?: ValidationRuleGroup;
}

export class ValidationSummaryDto {
  @ApiProperty({description: 'Total number of issues in the report.'})
  total!: number;

  @ApiProperty({
    description: 'Issue counts by effective severity.',
    type: 'object',
    additionalProperties: {type: 'number'},
  })
  bySeverity!: Record<string, number>;

  @ApiProperty({description: 'Number of BLOCKING issues.'})
  blocking!: number;

  @ApiProperty({
    description: 'Number of issues that are neither BLOCKING nor DATA_LOSS.',
  })
  nonBlocking!: number;

  @ApiProperty({description: 'Number of DATA_LOSS issues.'})
  dataLoss!: number;
}

export class ValidateFileResponseDto {
  @ApiProperty({description: 'System id of the file that was validated.'})
  fileSystemId!: string;

  @ApiProperty({
    description: 'ISO 8601 timestamp of when the response was built.',
  })
  runAt!: string;

  @ApiProperty({
    description:
      'Group that was actually run (SAVE_FILE when the request omitted it).',
    enum: VALIDATION_RULE_GROUP,
    enumName: 'ValidationRuleGroup',
  })
  group!: ValidationRuleGroup;

  @ApiProperty({description: 'True when at least one issue is BLOCKING.'})
  blockedSave!: boolean;

  @ApiProperty({type: ValidationSummaryDto})
  summary!: ValidationSummaryDto;
}
