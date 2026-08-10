/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createZodDto} from 'nestjs-zod';
import {
  ParamInfoDtoSchema,
  CkvDtoSchema,
  TkvDtoSchema,
  TagInfoDtoSchema,
} from '@arc/core';

export class ParamInfoResponseDto extends createZodDto(ParamInfoDtoSchema) {}
export class CkvResponseDto extends createZodDto(CkvDtoSchema) {}
export class TkvResponseDto extends createZodDto(TkvDtoSchema) {}
export class TagInfoResponseDto extends createZodDto(TagInfoDtoSchema) {}
