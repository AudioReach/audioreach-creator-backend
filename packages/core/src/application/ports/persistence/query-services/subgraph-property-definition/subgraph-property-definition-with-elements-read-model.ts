/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SubgraphPropertyDefinitionSummaryReadModel} from './subgraph-property-definition-read-model.js';
import type {PropertyDefinitionWithElements} from '../../../../usecase-designer/shared/property-definition-with-elements.js';

/**
 * Read model for a subgraph property definition that includes the binary
 * elements structure required for parsing calibration payloads, plus the
 * subgraph-specific `isVoice` flag inherited from `SubgraphPropertyDefinitionSummaryReadModel`.
 */
export interface SubgraphPropertyDefinitionWithElementsReadModel
  extends
    SubgraphPropertyDefinitionSummaryReadModel,
    PropertyDefinitionWithElements {}
