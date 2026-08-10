/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createZodDto} from 'nestjs-zod';
import {ContainerPropertyDefinitionSummaryDtoSchema} from '@arc/core';

export class ContainerPropertyDefinitionSummaryResponseDto extends createZodDto(
  ContainerPropertyDefinitionSummaryDtoSchema,
) {}
