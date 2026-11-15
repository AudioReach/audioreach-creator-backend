/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {BatchRead, EntityType, FailedEntity} from '@arc/core';
import {FAILED_ENTITY_REASON} from '@arc/core';

/**
 * What `resolveCanonicalLinks` needs from one link kind (data or control).
 *
 * The caller has already queried both tables with the requested IDs; most
 * IDs match one table and not the other. The accessors hide the only
 * difference between the kinds, the name of the segment's parent column:
 *
 *   data:    segment.dataLinkSystemId
 *   control: segment.controlLinkSystemId
 */
interface CanonicalLinkSource<Link extends {systemId: number}, Segment> {
  /** Rows of the link table whose systemId is one of the requested IDs. */
  readonly links: readonly Link[];
  /** Rows of the segment table whose systemId is one of the requested IDs. */
  readonly segments: readonly Segment[];
  /** The segment's own systemId. */
  readonly segmentSystemId: (segment: Segment) => number;
  /**
   * The systemId of the link the segment belongs to, or null when the
   * segment is not attached to a link yet (an unresolved subsystem link).
   */
  readonly parentSystemId: (segment: Segment) => number | null;
  /**
   * Loads link rows by systemId. Called once, for the parents of requested
   * segments whose link was not itself requested.
   */
  readonly loadLinks: (systemIds: number[]) => Promise<Link[]>;
}

/**
 * Resolves each requested ID to its canonical link row. A requested ID may
 * be a canonical link (data_links / control_links) or one of its subsystem
 * segments (subsystem_data_links / subsystem_control_links); a segment
 * resolves to the link it belongs to.
 *
 * Routing selection needs this: a client may select a link by any of its
 * segment IDs, and the router works on canonical links only.
 *
 * Rules:
 * - Each link appears once in `items`, however many of its IDs were
 *   requested (the link itself and/or several of its segments).
 * - An ID that is neither a link nor a segment is `NOT_FOUND`.
 * - A segment with no parent link, or whose parent cannot be loaded, is
 *   `NOT_FOUND` too, under the segment's ID.
 * - `items` holds rows; the caller maps them to entities.
 *
 * Example: link 10 has segments 11 and 12; segment 20 has no parent.
 *
 *   requested [10, 11, 12, 20, 99]
 *   items     [link 10]          (10, 11 and 12 all resolve to link 10)
 *   failed    [20, 99]           (both NOT_FOUND)
 *
 *   requested [11]               (only a segment)
 *   items     [link 10]          (link 10 is loaded through loadLinks)
 */
export async function resolveCanonicalLinks<
  Link extends {systemId: number},
  Segment,
  E extends EntityType,
>(
  entityType: E,
  requestedIds: readonly number[],
  source: CanonicalLinkSource<Link, Segment>,
): Promise<BatchRead<Link, E>> {
  const linkById = new Map(source.links.map(link => [link.systemId, link]));
  const segmentById = new Map(
    source.segments.map(segment => [source.segmentSystemId(segment), segment]),
  );

  // Step 1: load the parent links that the caller's query did not return,
  // i.e. a segment was requested but its link was not.
  const parentIdsToLoad = [
    ...new Set(
      source.segments
        .map(segment => source.parentSystemId(segment))
        .filter((id): id is number => id !== null && !linkById.has(id)),
    ),
  ];
  if (parentIdsToLoad.length > 0) {
    for (const link of await source.loadLinks(parentIdsToLoad)) {
      linkById.set(link.systemId, link);
    }
  }

  // Step 2: resolve each distinct requested ID, first as a link, then as a
  // segment's parent. `resolved` is keyed by link ID to drop duplicates.
  const resolved = new Map<number, Link>();
  const failed: FailedEntity<E>[] = [];
  for (const requestedId of new Set(requestedIds)) {
    const link =
      linkById.get(requestedId) ??
      parentLinkOf(segmentById.get(requestedId), source, linkById);
    if (link === undefined) {
      failed.push({
        systemId: requestedId,
        reason: FAILED_ENTITY_REASON.NotFound,
      });
    } else if (!resolved.has(link.systemId)) {
      resolved.set(link.systemId, link);
    }
  }
  return {entityType, items: [...resolved.values()], failed};
}

/** The loaded parent link of a segment, or undefined if there is none. */
function parentLinkOf<Link extends {systemId: number}, Segment>(
  segment: Segment | undefined,
  source: CanonicalLinkSource<Link, Segment>,
  linkById: ReadonlyMap<number, Link>,
): Link | undefined {
  if (segment === undefined) return undefined;
  const parentId = source.parentSystemId(segment);
  return parentId === null ? undefined : linkById.get(parentId);
}
