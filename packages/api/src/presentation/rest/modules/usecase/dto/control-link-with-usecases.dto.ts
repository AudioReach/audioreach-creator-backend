/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {ControlLinkDto} from '../../control-link/dto/control-link.dto.js';
import {UsecaseIdentifierDto} from './usecase.dto.js';

/**
 * DTO that pairs a control link with the usecases it belongs to.
 */
export class ControlLinkWithUsecasesDto {
  @ApiProperty({
    description: 'The control link',
    type: ControlLinkDto,
  })
  link: ControlLinkDto;

  @ApiProperty({
    description: 'Usecases that this control link is part of',
    type: [UsecaseIdentifierDto],
  })
  usecases: UsecaseIdentifierDto[];

  constructor(link: ControlLinkDto, usecases: UsecaseIdentifierDto[]) {
    this.link = link;
    this.usecases = usecases;
  }
}
