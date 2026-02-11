/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

export class ProcessorInfo {
  @ApiProperty({description: 'Unique system identifier for the processor'})
  systemId!: string;

  @ApiProperty({description: 'Processor identifier'})
  processorId!: number;

  @ApiProperty({description: 'Processor name'})
  name!: string;
}
