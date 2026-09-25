/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {COLLISION_RESOLUTION_MODE} from './same-gkv-collision.js';
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

const resolveSameGkvCollisionPayloadSchema = z.object({
  mode: z.enum([
    COLLISION_RESOLUTION_MODE.PathA,
    COLLISION_RESOLUTION_MODE.PathB,
    COLLISION_RESOLUTION_MODE.Merge,
    COLLISION_RESOLUTION_MODE.KeepExisting,
    COLLISION_RESOLUTION_MODE.ReplaceWithNew,
  ]),
  collisionId: z.uuid(),
  replayInput: replayInputSchema,
});

const removeStaleManualUsecaseEditPayloadSchema = z.object({
  changeIds: z
    .array(z.number().int().positive())
    .min(1)
    .transform(changeIds => [...new Set(changeIds)].sort((a, b) => a - b)),
});

export function parseResolveSameGkvCollisionPayload(
  payload: Record<string, unknown>,
): {
  readonly mode: (typeof COLLISION_RESOLUTION_MODE)[keyof typeof COLLISION_RESOLUTION_MODE];
  readonly collisionId: string;
  readonly replayInput: RoutingSelection;
} {
  return resolveSameGkvCollisionPayloadSchema.parse(payload);
}

export function parseRemoveStaleManualUsecaseEditPayload(
  payload: Record<string, unknown>,
): {readonly changeIds: readonly number[]} {
  return removeStaleManualUsecaseEditPayloadSchema.parse(payload);
}
