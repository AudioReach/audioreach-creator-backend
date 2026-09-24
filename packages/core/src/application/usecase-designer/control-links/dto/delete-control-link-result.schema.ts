/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {
  DeletedIdSchema,
  UpdatedSubsystemIntentsSchema,
} from '../../shared/delete-result.schema.js';

export const DeleteControlLinkResultSchema = z.object({
  deleted: z.object({
    controlLinks: z.array(DeletedIdSchema),
    subsystemControlLinks: z.array(DeletedIdSchema),
  }),
  updated: z.object({
    subsystems: z.array(UpdatedSubsystemIntentsSchema),
  }),
});

export type DeleteControlLinkResult = z.infer<
  typeof DeleteControlLinkResultSchema
>;
