/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {DeletedIdSchema} from '../../shared/delete-result.schema.js';

export const DeleteDataLinkResultSchema = z.object({
  deleted: z.object({
    dataLinks: z.array(DeletedIdSchema),
    subsystemDataLinks: z.array(DeletedIdSchema),
  }),
});

export type DeleteDataLinkResult = z.infer<typeof DeleteDataLinkResultSchema>;
