/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Persisted representation of a switch with module/link references keyed by
 * systemId instead of instanceNaturalId. Using systemId avoids false-positive matches
 * when a module is deleted and a new one is assigned the same instanceNaturalId in
 * the same session.
 *
 * Written by UiSwitchesResolver during upload; read back by UiMetadataBuilder
 * during download to reconstruct UiSwitch[] for the outgoing ui-metadata.json.
 */
export interface PersistedSwitchMetaLink {
  sourceSystemId: number;
  sourcePortNaturalId: number;
  sourceType: string;
  destinationSystemId: number;
  destinationPortNaturalId: number;
  destinationType: string;
  category: string;
}

export interface PersistedSwitchDataLink {
  sourceSystemId: number;
  sourcePortNaturalId: number;
  destSystemId: number;
  destinationPortNaturalId: number;
  metaLinks: PersistedSwitchMetaLink[];
}

export interface PersistedSwitchControlLink {
  sourceSystemId: number;
  sourcePortNaturalId: number;
  destSystemId: number;
  destinationPortNaturalId: number;
  metaLinks: PersistedSwitchMetaLink[];
}

export interface PersistedSwitchModuleRef {
  systemId: number;
}

export interface PersistedSwitch {
  naturalId: number;
  parentSubgraphNaturalId?: number;
  parentSubsystemNaturalId?: number;
  type: string;
  inputPort?: unknown;
  outputPort?: unknown;
  controlPort?: unknown;
  modules: PersistedSwitchModuleRef[];
  dataLinks: PersistedSwitchDataLink[];
  controlLinks: PersistedSwitchControlLink[];
}
