/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {ComponentChangeSummarySchema} from '../../../shared/dto/component-change-summary-dto.js';

/**
 * Result schema for DELETE /spf-modules/:id.
 *
 * Always contains a deleted bucket with:
 * - spfModules: exactly one entry (the deleted module)
 * - subgraphs:  one entry if the module was the last in its subgraph; absent otherwise
 * - containers: IDs of containers in the deleted subgraph that are cascade-deleted; absent otherwise
 * - dataLinks:  IDs of all DataLinks cascade-deleted from the module's data ports
 * - controlLinks: IDs of all ControlLinks cascade-deleted from the module's control ports
 */
export const DeleteSpfModuleResultSchema = ComponentChangeSummarySchema.pick({
  deleted: true,
}).required({deleted: true});

export type DeleteSpfModuleResult = z.infer<typeof DeleteSpfModuleResultSchema>;
