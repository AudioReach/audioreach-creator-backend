/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createZodDto} from 'nestjs-zod';
import {SubgraphPropertiesDtoSchema, SubgraphDtoSchema} from '@arc/core';

export class SubgraphPropertiesResponseDto extends createZodDto(
  SubgraphPropertiesDtoSchema,
) {}

export class SubgraphResponseDto extends createZodDto(SubgraphDtoSchema) {}
