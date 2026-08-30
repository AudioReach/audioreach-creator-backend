/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Read visibility mode for repository queries.
 *
 * - `Overlay` (default): reads reflect `committed + STAGED` — the effective
 *   in-session state. Consumers see manual edits, delete-cascades, and prior
 *   staged changes.
 * - `Committed`: reads bypass session STAGED edits and return the pre-session
 *   base-table state.
 */
export const READ_MODE = {
  Overlay: 'OVERLAY',
  Committed: 'COMMITTED',
} as const;
export type ReadMode = (typeof READ_MODE)[keyof typeof READ_MODE];

/**
 * Options bag accepted by read methods that support the readMode toggle.
 */
export interface ReadOptions {
  readMode?: ReadMode;
}
