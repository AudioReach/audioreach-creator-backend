/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {ComponentCollectionWithSubsystemsDtoSchema} from '../../usecase/dto/component-collection-dto.js';

// Uses z.lazy() via ComponentCollectionWithSubsystemsDtoSchema — not compatible with createZodDto
export const MoveSubsystemComponentsDtoSchema = z
  .object({
    added: ComponentCollectionWithSubsystemsDtoSchema.optional().describe(
      'Components that were moved (with updated parentId) and any newly constructed links.',
    ),
    updated: ComponentCollectionWithSubsystemsDtoSchema.optional().describe(
      'Entities that pre-existed and were modified by the move.',
    ),
    removed: ComponentCollectionWithSubsystemsDtoSchema.optional().describe(
      'Links that were removed because they became invalid after the move.',
    ),
  })
  .describe('Move subsystem components response');

export type MoveSubsystemComponentsDto = z.infer<
  typeof MoveSubsystemComponentsDtoSchema
>;
