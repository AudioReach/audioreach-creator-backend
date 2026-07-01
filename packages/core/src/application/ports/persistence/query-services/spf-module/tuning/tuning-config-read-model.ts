/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  KeyReadModel,
  ValueReadModel,
} from '../../key-value/key-value-definition-read-model.js';

/**
 * Result for one CKV bin — systemId + key-value pairs that identify the bin.
 * Key-value pairs resolved via KeyValueDefQueryService (KeyReadModel + ValueReadModel).
 */
export interface CkvReadModel {
  readonly systemId: number;
  readonly keyValuePairs: ReadonlyArray<{
    readonly key: KeyReadModel;
    readonly value: ValueReadModel;
  }>;
}

/**
 * Result for one TKV bin — mirrors CkvReadModel plus its parent tag reference.
 */
export interface TkvReadModel {
  readonly systemId: number;
  readonly moduleTagIdMapSystemId: number;
  readonly keyValuePairs: ReadonlyArray<{
    readonly key: KeyReadModel;
    readonly value: ValueReadModel;
  }>;
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
