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

export class KeyInfoDto extends createZodDto(KeyInfoDtoSchema) {}
export class ValueInfoDto extends createZodDto(ValueInfoDtoSchema) {}
export class KeyValueInfoDto extends createZodDto(KeyValueInfoDtoSchema) {}
export class KeyValuePairsInfoDto extends createZodDto(
  KeyValuePairsInfoDtoSchema,
) {}
export class SubsystemFilteredKeyValuePairsInfoDto extends createZodDto(
  SubsystemFilteredKeyValuePairsInfoDtoSchema,
) {}
