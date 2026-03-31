/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {DataLinkDto} from '../../data-link/dto/data-link.dto.js';
import {UsecaseIdentifierDto} from './usecase.dto.js';

/**
 * DTO that pairs a data link with the usecases it belongs to.
 */
export class DataLinkWithUsecasesDto {
  @ApiProperty({
    description: 'The data link',
    type: DataLinkDto,
  })
  link: DataLinkDto;

  @ApiProperty({
    description: 'Usecases that this data link is part of',
    type: [UsecaseIdentifierDto],
  })
  usecases: UsecaseIdentifierDto[];

  constructor(link: DataLinkDto, usecases: UsecaseIdentifierDto[]) {
    this.link = link;
    this.usecases = usecases;
  }
}
