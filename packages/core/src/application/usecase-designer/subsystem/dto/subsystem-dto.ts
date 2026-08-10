/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {KeyInfoDtoSchema} from '../../spf-module/query/spf-module-dto.js';
import {ComponentCollectionWithSubsystemsDtoSchema} from '../../usecase/dto/component-collection-dto.js';

export const SubsystemDtoSchema: z.ZodType = z.lazy(() =>
  z.object({
    systemId: z.string().describe('System ID'),
    id: z.number().int().describe('Component ID'),
    name: z.string().optional().describe('Subsystem name'),
    parentId: z.number().int().optional().describe('Parent component ID'),
    filteredKeys: z
      .array(KeyInfoDtoSchema)
      .describe('Filtered keys assigned to the subsystem'),
    children: ComponentCollectionWithSubsystemsDtoSchema.optional().describe(
      'Child components within this subsystem (includes nested subsystems)',
    ),
    relatedEndPointLinks: z
      .array(z.unknown())
      .optional()
      .describe('Related endpoint links'),
  }),
);

export type SubsystemDto = z.infer<typeof SubsystemDtoSchema>;
