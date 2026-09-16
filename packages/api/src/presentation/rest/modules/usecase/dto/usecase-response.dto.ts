/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createZodDto} from 'nestjs-zod';
import {ApiProperty} from '@nestjs/swagger';
import {
  SubsystemFilteredKvDtoSchema,
  SubsystemFilteredUsecasesResponseDtoSchema,
  UseCaseDtoSchema,
} from '@arc/core';
import {EndPointLink} from '../../../common/utils/index.js';

export class UsecaseResponseDto extends createZodDto(UseCaseDtoSchema) {
  @ApiProperty({
    description: 'Related endpoint links for the usecase',
    type: [EndPointLink],
    required: false,
  })
  relatedEndPointLinks?: EndPointLink[];
}

export enum UsecaseType {
  Ec = 'EC',
  Linked = 'LINKED',
  Island = 'ISLAND',
}

/** Swagger/NestJS wrapper for the core filtered-GKV contract. */
export class SubsystemFilteredKvDto extends createZodDto(
  SubsystemFilteredKvDtoSchema,
) {}

/** Swagger/NestJS wrapper for the core filtered-usecase response contract. */
export class SubsystemFilteredUsecasesResponseDto extends createZodDto(
  SubsystemFilteredUsecasesResponseDtoSchema,
) {}
