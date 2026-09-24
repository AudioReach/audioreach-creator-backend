/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {KeyValuePairsInfoDtoSchema} from '../../spf-module/query/spf-module-dto.js';
import type {SubgraphReadModel} from '../../../ports/persistence/query-services/subgraph/subgraph-read-model.js';

export const SubgraphDtoSchema = z
  .object({
    systemId: z.string().describe('System ID'),
    naturalId: z.number().int().describe('Component natural ID'),
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

export function mapSubgraph(s: SubgraphReadModel): SubgraphDto {
  return {
    systemId: String(s.systemId),
    naturalId: s.naturalId,
    name: s.name,
    subGraphSharedType: s.isImported ? 'Imported' : 'None',
    SGKV: (s.sgkvs ?? []).map(sgkv => ({
      systemId: String(sgkv.systemId),
      keyValuePairs: sgkv.keyValuePairs.map(kv => ({
        key: {
          naturalId: kv.key.naturalId,
          name: kv.key.name,
          systemId: String(kv.key.systemId),
        },
        value: {
          naturalId: kv.value.naturalId,
          name: kv.value.name,
          systemId: String(kv.value.systemId),
        },
      })),
    })),
  };
}
