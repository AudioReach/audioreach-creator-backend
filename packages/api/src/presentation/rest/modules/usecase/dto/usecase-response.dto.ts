/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createZodDto} from 'nestjs-zod';
import {ApiProperty} from '@nestjs/swagger';
import {UseCaseDtoSchema} from '@arc/core';
import {EndPointLink} from '../../../common/utils/index.js';
import {KeyValueInfoDto} from '../../../common/dto/kv-info.dto.js';

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

export class SubsystemFilteredKvDto {
  @ApiProperty({
    description: 'Collection of key-value pairs after subsystem filter applied',
    type: [KeyValueInfoDto],
  })
  readonly keyValuePairs: KeyValueInfoDto[];

  constructor(keyValuePairs: KeyValueInfoDto[]) {
    this.keyValuePairs = keyValuePairs;
  }
}

export class SubsystemFilteredUsecasesResponseDto {
  @ApiProperty({
    description: 'Subsystem-filtered key-value information',
    type: SubsystemFilteredKvDto,
  })
  readonly filteredKv: SubsystemFilteredKvDto;

  @ApiProperty({
    description: 'Array of usecase identifiers that match the subsystem filter',
    type: [UsecaseResponseDto],
  })
  readonly usecases: UsecaseResponseDto[];

  constructor(
    filteredKv: SubsystemFilteredKvDto,
    usecases: UsecaseResponseDto[],
  ) {
    this.filteredKv = filteredKv;
    this.usecases = usecases;
  }
}
