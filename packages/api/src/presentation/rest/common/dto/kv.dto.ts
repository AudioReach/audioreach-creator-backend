/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createZodDto} from 'nestjs-zod';
import {
  KeyInfoDtoSchema,
  ValueInfoDtoSchema,
  KeyValueInfoDtoSchema,
  KeyValuePairsInfoDtoSchema,
  SubsystemFilteredKeyValuePairsInfoDtoSchema,
} from '@arc/core';

export class KeyInfoResponseDto extends createZodDto(KeyInfoDtoSchema) {}
export class ValueInfoResponseDto extends createZodDto(ValueInfoDtoSchema) {}
export class KeyValueInfoResponseDto extends createZodDto(
  KeyValueInfoDtoSchema,
) {}
export class KeyValuePairsInfoResponseDto extends createZodDto(
  KeyValuePairsInfoDtoSchema,
) {}
export class SubsystemFilteredKeyValuePairsInfoResponseDto extends createZodDto(
  SubsystemFilteredKeyValuePairsInfoDtoSchema,
) {}
