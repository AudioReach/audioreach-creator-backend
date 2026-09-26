/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {KeyValueInfoDto} from '../../../../../shared/dto/key-value-info-dto.js';

export interface VcpmCkvReadModel {
  systemId: number;
  values: KeyValueInfoDto[];
}

export interface VcpmParameterPayloadReadModel {
  systemId: number;
  vcpmParameterSystemId: number;
  vcpmCkvSystemId: number;
  payload: Uint8Array | null;
}

export interface VcpmParameterCkvLinkReadModel {
  parameterSystemId: number;
  ckvSystemIds: number[];
}

export interface VcpmAggregateOptions {
  /** When supplied, restricts the aggregate to one CKV for cal-data. */
  ckvSystemId?: number;
  /** When supplied, restricts payloads to the selected parameters. */
  paramSystemIds?: number[];
}

export interface VcpmAggregateReadModel {
  /** All effective CKVs, or the selected CKV when ckvSystemId is supplied. */
  ckvs: VcpmCkvReadModel[];
  /** Effective parameter-to-CKV associations for summary composition. */
  parameterCkvLinks: VcpmParameterCkvLinkReadModel[];
  /** Payload rows are populated for a selected CKV and empty for summary reads. */
  payloads: VcpmParameterPayloadReadModel[];
  parameterDefinitions: VcpmParameterDefinitionReadModel[];
}

export interface VcpmParameterDefinitionReadModel {
  systemId: number;
  // VCPM's parameter natural identifier is persisted as param_id.
  // eslint-disable-next-line custom/no-ambiguous-id-fields -- paramId is the established VCPM natural-ID field
  paramId: number;
  name: string;
  isReadOnly: boolean;
  elementsStructure: string;
}
