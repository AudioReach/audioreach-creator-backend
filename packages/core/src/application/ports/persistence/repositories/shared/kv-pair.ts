/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * A single (keyDef, valueDef) KV pair within an SGKV instance.
 * Defined here (the primary consumer) and re-exported for use by
 * SubgraphRepository.getSgkvs.
 */
export interface KvPair {
  keyDefSystemId: number;
  valueDefSystemId: number;
}
