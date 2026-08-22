/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Persisted representation of a switch with module/link references keyed by
 * systemId instead of instanceId. Using systemId avoids false-positive matches
 * when a module is deleted and a new one is assigned the same instanceId in
 * the same session.
 *
 * Written by UiSwitchesResolver during upload; read back by UiMetadataBuilder
 * during download to reconstruct UiSwitch[] for the outgoing ui-metadata.json.
 */
export interface PersistedSwitchMetaLink {
  sourceSystemId: number;
  sourcePortId: number;
  sourceType: string;
  destinationSystemId: number;
  destinationPortId: number;
  destinationType: string;
  category: string;
}

export interface PersistedSwitchDataLink {
  sourceSystemId: number;
  sourcePortId: number;
  destSystemId: number;
  destinationPortId: number;
  metaLinks: PersistedSwitchMetaLink[];
}

export interface PersistedSwitchControlLink {
  sourceSystemId: number;
  sourcePortId: number;
  destSystemId: number;
  destinationPortId: number;
  metaLinks: PersistedSwitchMetaLink[];
}

export interface PersistedSwitchModuleRef {
  systemId: number;
}

export interface PersistedSwitch {
  id: number;
  parentSubgraphId?: number;
  parentSubsystemId?: number;
  type: string;
  inputPort?: unknown;
  outputPort?: unknown;
  controlPort?: unknown;
  modules: PersistedSwitchModuleRef[];
  dataLinks: PersistedSwitchDataLink[];
  controlLinks: PersistedSwitchControlLink[];
}
