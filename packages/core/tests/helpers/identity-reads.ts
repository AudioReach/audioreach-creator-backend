/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ENTITY_TYPE, type EntityType} from '../../src/shared/entity-type.js';
import {batchOf} from './batch-read.js';

function noIdentities(entityType: EntityType) {
  return async () => batchOf(entityType, []);
}

/**
 * Identity reads that find nothing, for spreading into mocked repositories.
 * An issue rendered through them names each entity by its systemId.
 */
export const NO_IDENTITY_READS = {
  findUseCaseIdentities: noIdentities(ENTITY_TYPE.UseCase),
  findSubgraphIdentities: noIdentities(ENTITY_TYPE.Subgraph),
  findSpfModuleIdentities: noIdentities(ENTITY_TYPE.SpfModule),
  findSubsystemIdentities: noIdentities(ENTITY_TYPE.Subsystem),
  findKeyDefinitionIdentities: noIdentities(ENTITY_TYPE.KeyDefinition),
  findValueDefinitionIdentities: noIdentities(ENTITY_TYPE.ValueDefinition),
  findDataLinkIdentities: noIdentities(ENTITY_TYPE.DataLink),
  findControlLinkIdentities: noIdentities(ENTITY_TYPE.ControlLink),
};
