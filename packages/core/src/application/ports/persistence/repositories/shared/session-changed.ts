/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Session-scoped diff shape: entities added or deleted within the current
 * edit session. Two buckets only — sufficient for consumers that need
 * topology-level "what changed" information.
 *
 * UPDATE-shaped edit_actions are intentionally excluded. Widen the type
 * non-breakingly (add a required field) if a future consumer needs it.
 */
export interface SessionChanged<T> {
  readonly added: readonly T[];
  readonly deleted: readonly T[];
}
