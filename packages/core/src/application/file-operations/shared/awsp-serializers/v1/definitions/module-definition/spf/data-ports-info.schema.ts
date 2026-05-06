/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {AwspPortSchema} from './port.schema.js';

/**
 * Schema for data ports information.
 */
export const AwspDataPortsInfoSchema = z.object({
  maxPortCount: z.number(),
  ports: z.array(AwspPortSchema).optional(),
});

export type AwspDataPortsInfo = z.infer<typeof AwspDataPortsInfoSchema>;
