/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsInt, IsNotEmpty} from 'class-validator';

export class SetContainerHeapIdRequestDto {
  @ApiProperty({description: 'Container heap ID'})
  @IsInt()
  @IsNotEmpty()
  heapId!: number;
}
