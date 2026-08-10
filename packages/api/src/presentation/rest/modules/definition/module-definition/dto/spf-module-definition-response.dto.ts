/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createZodDto} from 'nestjs-zod';
import {SpfModuleDefinitionDtoSchema} from '@arc/core';

export class SpfModuleDefinitionResponseDto extends createZodDto(
  SpfModuleDefinitionDtoSchema,
) {}
