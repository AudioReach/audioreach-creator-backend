/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {
  ControlLinkWithUsecasesDtoSchema,
  DataLinkWithUsecasesDtoSchema,
} from '../../subgraph/dto/subgraph-pair-dto.js';

export const SubgraphLinksDtoSchema = z.object({
  dataLinks: z
    .array(DataLinkWithUsecasesDtoSchema)
    .describe('Data links associated with the requested subgraph'),
  controlLinks: z
    .array(ControlLinkWithUsecasesDtoSchema)
    .describe('Control links associated with the requested subgraph'),
});

export type SubgraphLinksDto = z.infer<typeof SubgraphLinksDtoSchema>;
