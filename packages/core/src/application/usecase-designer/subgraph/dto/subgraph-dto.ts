/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {KeyValuePairsInfoDtoSchema} from '../../spf-module/query/spf-module-dto.js';

export const SubgraphDtoSchema = z
  .object({
    systemId: z.string().describe('System ID'),
    id: z.number().int().describe('Component ID'),
    name: z.string().optional().describe('Component name'),
    subGraphSharedType: z.string().describe('Subgraph shared type'),
    SGKV: z
      .array(KeyValuePairsInfoDtoSchema)
      .describe('List of KV information'),
    relatedEndPointLinks: z
      .array(z.unknown())
      .optional()
      .describe('Related endpoint links'),
  })
  .describe('Subgraph');

export type SubgraphDto = z.infer<typeof SubgraphDtoSchema>;
