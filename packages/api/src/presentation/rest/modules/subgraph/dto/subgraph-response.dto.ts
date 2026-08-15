/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createZodDto} from 'nestjs-zod';
import {
  SubgraphPropertiesDtoSchema,
  SubgraphDtoSchema,
  ScenarioChangeDtoSchema,
  VsidUpdateDtoSchema,
  VcpmCkvDtoSchema,
  CreateVcpmCkvDtoSchema,
} from '@arc/core';

export class SubgraphPropertiesResponseDto extends createZodDto(
  SubgraphPropertiesDtoSchema,
) {}

export class SubgraphResponseDto extends createZodDto(SubgraphDtoSchema) {}

export class UpdateScenarioResponseDto extends createZodDto(
  ScenarioChangeDtoSchema,
) {}
export class UpdateVsidResponseDto extends createZodDto(
  VsidUpdateDtoSchema.meta({id: 'UpdateVsidResponseDto'}),
) {}
export class VcpmCkvResponseDto extends createZodDto(
  VcpmCkvDtoSchema.meta({id: 'VcpmCkvResponseDto'}),
) {}
export class CreateVcpmCkvResponseDto extends createZodDto(
  CreateVcpmCkvDtoSchema,
) {}
