/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createZodDto} from 'nestjs-zod';
import {ComponentCollectionDtoSchema} from '@arc/core';

export class ComponentCollectionResponseDto extends createZodDto(
  ComponentCollectionDtoSchema,
) {}
