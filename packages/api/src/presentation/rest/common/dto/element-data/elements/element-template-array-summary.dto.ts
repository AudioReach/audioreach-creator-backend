/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createZodDto} from 'nestjs-zod';
import {ElementTemplateArraySummaryDtoSchema} from '@arc/core';

export class ElementTemplateArraySummaryDto extends createZodDto(
  ElementTemplateArraySummaryDtoSchema,
) {}
