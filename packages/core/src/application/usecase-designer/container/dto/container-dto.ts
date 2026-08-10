/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';

export const ContainerDtoSchema = z.object({
  systemId: z
    .string()
    .describe(
      'Unique system identifier (string form of the database system_id)',
    ),
  id: z
    .number()
    .int()
    .describe('Container database ID (containerId from ACDB)'),
  name: z
    .string()
    .describe(
      'Container type name, or containerTypeSystemId as string when name is not yet populated',
    ),
});

export type ContainerDto = z.infer<typeof ContainerDtoSchema>;
