/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {KeyInfoDtoSchema} from '../../spf-module/query/spf-module-dto.js';

export const SubsystemFilteredKeysDtoSchema = z
  .object({
    systemId: z
      .string()
      .describe('System-generated unique identifier of the subsystem'),
    filteredKeys: z
      .array(KeyInfoDtoSchema)
      .describe('Filtered keys to assign to the subsystem'),
  })
  .describe('SubsystemFilteredKeys');

export type SubsystemFilteredKeysDto = z.infer<
  typeof SubsystemFilteredKeysDtoSchema
>;
