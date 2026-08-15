/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';

/**
 * ID-only summary of one entity category within a change bucket.
 * Carries system IDs, not full entity objects — the client uses these to
 * update its local model and undo/redo stack.
 *
 * Add new entity types here as further composite operations are introduced.
 */
export const EntityIdCollectionSchema = z.object({
  spfModules: z.array(z.string()).optional(),
  subgraphs: z.array(z.string()).optional(),
  containers: z.array(z.string()).optional(),
  dataLinks: z.array(z.string()).optional(),
  controlLinks: z.array(z.string()).optional(),
});

/**
 * Lightweight change summary returned by write endpoints that affect multiple
 * entity types. Each bucket carries the IDs of entities that were added,
 * updated, or deleted in the operation (primary action + all side effects).
 *
 * This is the ID-only companion to ComponentCollectionDtoSchema (which carries
 * full entity objects). Use this when the client only needs IDs for cache
 * invalidation; use ComponentCollectionDtoSchema when it needs full state.
 *
 * Mirrors the added/updated/deleted bucket shape of MoveSubsystemComponentsDtoSchema.
 */
export const ComponentChangeSummarySchema = z.object({
  added: EntityIdCollectionSchema.optional(),
  updated: EntityIdCollectionSchema.optional(),
  deleted: EntityIdCollectionSchema.optional(),
});

export type EntityIdCollection = z.infer<typeof EntityIdCollectionSchema>;
export type ComponentChangeSummary = z.infer<
  typeof ComponentChangeSummarySchema
>;
