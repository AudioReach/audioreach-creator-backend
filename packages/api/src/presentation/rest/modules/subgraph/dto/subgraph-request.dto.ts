/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, IsOptional, IsString} from 'class-validator';
import {z} from 'zod';
import {createZodDto} from 'nestjs-zod';

export class CloneSubgraphRequest {
  @ApiProperty({description: 'Reference Subgraph system ID'})
  @IsNotEmpty()
  @IsString()
  refSubgraphSystemId!: string;

  @ApiProperty({description: 'Target parent system ID', required: false})
  @IsOptional()
  @IsString()
  targetParentSystemId?: string;
}

export class PatchSubgraphRequestDto extends createZodDto(
  z
    .object({name: z.string().min(1).optional()})
    .refine(d => d.name !== undefined, {
      message: 'At least one field must be provided',
    }),
) {}

export class UpdateSubgraphContainerIdRequestDto extends createZodDto(
  z.object({
    oldContainerId: z.number().int(),
    newContainerId: z.number().int(),
  }),
) {}

export class CreateVcpmCkvRequestDto extends createZodDto(
  z.object({
    ckv: z.array(z.object({valueSystemIds: z.array(z.string()).min(1)})).min(1),
  }),
) {}
