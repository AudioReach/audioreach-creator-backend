/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {KeyValuePairListReadModel} from '../../usecase/query-models/key-vector-read-model.js';

/**
 * Result for one CKV bin — systemId + key-value pairs that identify the bin.
 * Key-value pairs resolved via KeyValueDefQueryService (KeyDefinitionSummaryReadModel + ValueDefinitionSummaryReadModel).
 */
export interface CkvReadModel extends KeyValuePairListReadModel {
  /** UI persistence binary data for a given CKV. */
  readonly uiPersistence?: Uint8Array | null;
}

/**
 * Result for one TKV bin — mirrors CkvReadModel plus its parent tag reference.
 */
export interface TkvReadModel extends KeyValuePairListReadModel {
  readonly moduleTagIdMapSystemId: number;
}

/**
 * Result for one tag group with its TKV bins.
 * summary     → tagId + tagName + tkvs with key-value pairs
 * fullDetails → summary + params + payload per TKV
 */
export interface TagReadModel {
  readonly systemId: number;
  readonly tagDefinitionSystemId: number;
  readonly tagId: number;
  readonly tagName: string;
  readonly tkvs: TkvReadModel[];
}

/**
 * One parameter with its definition and optional binary payload.
 * systemId   — ckv_parameter_payload / tkv_parameter_payload row
 * definition — spf_module_parameter_definitions row (overlay applied)
 * payload    — binary cal data — present only when fullDetails=true
 */
export interface CkvParamReadModel {
  readonly systemId: number;
  readonly definition: {
    readonly systemId: number;
    readonly parameterId: number;
    readonly name?: string;
    readonly description?: string;
    readonly pidType: string;
    readonly elementsStructure?: string;
    readonly isPersistent?: boolean;
    readonly isReadOnly?: boolean;
    readonly maxSize?: number;
    readonly toolPolicies?: string;
  };
  readonly payload?: Uint8Array;
}
