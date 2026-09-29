/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';

export const DeletedIdSchema = z.object({
  systemId: z.string(),
});

export const UpdatedSubsystemIntentsSchema = z.object({
  systemId: z.string(),
  intentsClearedControlPorts: z.array(DeletedIdSchema),
});
