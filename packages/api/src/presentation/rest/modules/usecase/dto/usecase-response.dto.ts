/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createZodDto} from 'nestjs-zod';
import {ApiProperty} from '@nestjs/swagger';
import {UseCaseDtoSchema} from '@arc/core';
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
  Ec = 'Ec',
  Regular = 'Regular',
  Manual = 'Manual',
}

export class SubsystemFilteredUsecasesResponseDto {
  @ApiProperty({
    description: 'Subsystem-filtered key-value information',
    required: false,
  })
  readonly filteredKv: unknown;

  @ApiProperty({
    description: 'Array of usecase identifiers that match the subsystem filter',
    type: [UsecaseResponseDto],
  })
  readonly usecases: UsecaseResponseDto[];

  constructor(filteredKv: unknown, usecases: UsecaseResponseDto[]) {
    this.filteredKv = filteredKv;
    this.usecases = usecases;
  }
}
