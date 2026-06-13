/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ReadModelBase} from '../../../../../shared/read-model-base.js';
import type {KeyValuePairReadModel} from '../../usecase/query-models/key-vector-read-model.js';

/**
 * Parameter identity only — no binary payload.
 * Used by tuning-config (name + description visible in the catalogue view).
 */
export interface ParamSummaryReadModel {
  readonly systemId: number;
  readonly parameterId: number;
  readonly name: string;
  readonly description?: string;
}

/**
 * One CKV bin for tuning catalogue — key-value selector + param names.
 * Does NOT load uiPersistence or binary payloads.
 */
export interface CkvTuningReadModel extends ReadModelBase {
  readonly keyValuePairs: KeyValuePairReadModel[];
  readonly parameters: ParamSummaryReadModel[];
}

/**
 * One TKV bin for tuning catalogue — mirrors CkvTuningReadModel exactly.
 * moduleTagIdMapSystemId links back to the parent tag group.
 */
export interface TkvTuningReadModel extends ReadModelBase {
  readonly moduleTagIdMapSystemId: number;
  readonly keyValuePairs: KeyValuePairReadModel[];
  readonly parameters: ParamSummaryReadModel[];
}

/**
 * One tag group with its TKV bins.
 * tagId + tagName come from tag_definitions table.
 */
export interface TagTuningReadModel extends ReadModelBase {
  readonly tagDefinitionSystemId: number;
  readonly tagId: number;
  readonly tagName: string;
  readonly tkvs: TkvTuningReadModel[];
}

/**
 * Final assembled tuning config for one SPF module.
 * Returned by SpfTuningConfigService.getModuleTuningConfig().
 *
 * ckvs/tags are null when the corresponding flag was false — distinguishing
 * "not requested" from "requested but empty".
 */
export interface SpfModuleTuningConfigReadModel {
  readonly moduleSystemId: number;
  readonly ckvs: CkvTuningReadModel[] | null;
  readonly tags: TagTuningReadModel[] | null;
}
