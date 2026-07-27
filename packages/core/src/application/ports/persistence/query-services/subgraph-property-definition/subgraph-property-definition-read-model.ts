/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  PropertyDefinitionSummaryReadModel,
  PropertyDefinitionReadModel,
} from '../property-definition/property-definition-read-model.js';

export interface SubgraphPropertyDefinitionSummaryReadModel extends PropertyDefinitionSummaryReadModel {
  readonly isVoice: boolean;
}

export interface SubgraphPropertyDefinitionReadModel
  extends
    SubgraphPropertyDefinitionSummaryReadModel,
    PropertyDefinitionReadModel {}
