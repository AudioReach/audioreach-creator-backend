/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {
  COLLISION_RESOLUTION_MODE,
  type CollisionResolutionSelection,
} from './same-gkv-collision.js';
import type {RoutingSelection} from './routing-input.js';

const replayInputSchema = z.object({
  selectedUsecaseSystemIds: z.array(z.number().int()),
  activeSubgraphs: z.array(
    z.object({
      systemId: z.number().int(),
      sgkvs: z.array(z.array(z.number().int())),
    }),
  ),
  excludedSubgraphSystemIds: z.array(z.number().int()),
  excludedDataLinkSystemIds: z.array(z.number().int()),
  excludedControlLinkSystemIds: z.array(z.number().int()),
});

const collisionSelectionSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal(COLLISION_RESOLUTION_MODE.SelectCandidate),
    collisionId: z.uuid(),
    alternativeId: z.uuid(),
  }),
  z.object({
    mode: z.literal(COLLISION_RESOLUTION_MODE.KeepExisting),
    collisionId: z.uuid(),
  }),
  z.object({
    mode: z.literal(COLLISION_RESOLUTION_MODE.MergeAll),
    collisionId: z.uuid(),
  }),
]);

const resolveSameGkvCollisionPayloadSchema = z.intersection(
  collisionSelectionSchema,
  z.object({replayInput: replayInputSchema}),
);

const deleteStaleManualUsecaseEditPayloadSchema = z.object({
  changeIds: z
    .array(z.number().int().positive())
    .min(1)
    .transform(changeIds => [...new Set(changeIds)].sort((a, b) => a - b)),
});

export function parseResolveSameGkvCollisionPayload(
  payload: Record<string, unknown>,
): {
  readonly selection: CollisionResolutionSelection;
  readonly replayInput: RoutingSelection;
} {
  const parsed = resolveSameGkvCollisionPayloadSchema.parse(payload);
  const selection: CollisionResolutionSelection =
    parsed.mode === COLLISION_RESOLUTION_MODE.SelectCandidate
      ? {
          mode: parsed.mode,
          collisionId: parsed.collisionId,
          alternativeId: parsed.alternativeId,
        }
      : {mode: parsed.mode, collisionId: parsed.collisionId};
  return {selection, replayInput: parsed.replayInput};
}

export function parseDeleteStaleManualUsecaseEditPayload(
  payload: Record<string, unknown>,
): {readonly changeIds: readonly number[]} {
  return deleteStaleManualUsecaseEditPayloadSchema.parse(payload);
}
