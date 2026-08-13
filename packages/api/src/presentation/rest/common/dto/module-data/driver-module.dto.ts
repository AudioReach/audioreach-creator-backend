/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createZodDto} from 'nestjs-zod';
import {DriverModuleDefinitionDtoSchema} from '@arc/core';

export class DriverModuleDto extends createZodDto(
  DriverModuleDefinitionDtoSchema,
) {}
export class DriverModuleSummaryDto extends createZodDto(
  DriverModuleDefinitionDtoSchema,
) {}
