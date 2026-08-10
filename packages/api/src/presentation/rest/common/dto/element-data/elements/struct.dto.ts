/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createZodDto} from 'nestjs-zod';
import {StructDtoSchema} from '@arc/core';

export class StructResponseDto extends createZodDto(StructDtoSchema) {}
