/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createZodDto} from 'nestjs-zod';
import {SubgraphPropertyDefinitionDtoSchema} from '@arc/core';

export class SubgraphPropertyDefinitionResponseDto extends createZodDto(
  SubgraphPropertyDefinitionDtoSchema,
) {}
