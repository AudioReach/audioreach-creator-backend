/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createZodDto} from 'nestjs-zod';
import {CkvDtoSchema} from '@arc/core';

export class CkvResponseDto extends createZodDto(CkvDtoSchema) {}
