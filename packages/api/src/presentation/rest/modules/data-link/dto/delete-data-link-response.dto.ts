/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createZodDto} from 'nestjs-zod';
import {DeleteDataLinkResultSchema} from '@arc/core';

export class DeleteDataLinkResponseDto extends createZodDto(
  DeleteDataLinkResultSchema,
) {}
