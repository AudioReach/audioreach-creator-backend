/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';

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
const DeletedIdSchema = z.object({
  systemId: z.string(),
});

const DeletedLinkSchema = z.object({
  systemId: z.string(),
  subsystemLinks: z.array(DeletedIdSchema).optional(),
});

const UpdatedSubsystemSchema = z.object({
  systemId: z.string(),
  intentsClearedControlPorts: z.array(DeletedIdSchema),
});

const UpdatedContainerSchema = z.object({
  systemId: z.string(),
  stackSize: z.number().int().nonnegative(),
});

export const DeleteSpfModuleResultSchema = z.object({
  deleted: z.object({
    spfModules: z.array(DeletedIdSchema),
    subgraphs: z.array(DeletedIdSchema),
    containers: z.array(DeletedIdSchema),
    dataLinks: z.array(DeletedLinkSchema),
    controlLinks: z.array(DeletedLinkSchema),
    unresolvedSubsystemDataLinks: z.array(DeletedIdSchema).optional(),
    unresolvedSubsystemControlLinks: z.array(DeletedIdSchema).optional(),
  }),
  updated: z.object({
    containers: z.array(UpdatedContainerSchema),
    usecases: z.array(DeletedIdSchema),
    subsystems: z.array(UpdatedSubsystemSchema).optional(),
  }),
});

export type DeleteSpfModuleResult = z.infer<typeof DeleteSpfModuleResultSchema>;
