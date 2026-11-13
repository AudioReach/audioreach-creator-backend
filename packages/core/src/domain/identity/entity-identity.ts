/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {IssueEntityType} from '../../shared/issues/impacted-entity.js';

/**
 * The natural identity of an entity: the fields that tell a user which entity
 * is meant, without its persistence `systemId`. Identities are plain data;
 * `IdentityFormatter` turns them into text.
 */

/** An entity identified by its name and natural ID. */
export interface NamedNaturalId {
  readonly name: string;
  readonly naturalId: number;
}

/** One GKV pair: a key definition and one of its values. */
export interface NamedKeyValue {
  readonly key: NamedNaturalId;
  readonly value: NamedNaturalId;
}

/** A port of a link endpoint. A port may have no name. */
export interface PortIdentity {
  readonly name: string | null;
  readonly naturalId: number;
}

/** One end of a link: the node it connects to and the port it uses. */
export interface LinkEndpoint {
  readonly node: EntityRef<'SpfModule'> | EntityRef<'Subsystem'>;
  readonly port: PortIdentity;
}

/**
 * The identity of each entity type that has one. A type without an entry has
 * no identity yet; its references always use the systemId fallback. An entry
 * is added when the first producer of that type's references is converted.
 */
export interface EntityIdentityMap {
  /** GKV pairs in the order of the UseCase's key vector. */
  UseCase: {readonly alias?: string; readonly gkv: readonly NamedKeyValue[]};
  Subgraph: NamedNaturalId;
  /** `definitionName` is shown when the module has no alias. */
  SpfModule: {
    readonly alias?: string;
    readonly definitionName: string;
    readonly naturalId: number;
  };
  Subsystem: NamedNaturalId;
  KeyDefinition: NamedNaturalId;
  ValueDefinition: NamedKeyValue;
  TagDefinition: NamedNaturalId;
  DataLink: {readonly source: LinkEndpoint; readonly destination: LinkEndpoint};
  /** A control link has no direction; the formatter orders its endpoints. */
  ControlLink: {readonly endpoints: readonly [LinkEndpoint, LinkEndpoint]};
}

/** The identity of entity type `T`, or `never` if `T` has none. */
export type IdentityFor<T extends IssueEntityType> =
  T extends keyof EntityIdentityMap ? EntityIdentityMap[T] : never;

/**
 * A reference to an entity. `systemId` is for machines (selection, follow-up
 * commands); `identity` is what text shows. `identity` is missing when the
 * entity was not found or its identity could not be read.
 */
export type EntityRef<T extends IssueEntityType = IssueEntityType> = {
  [K in T]: {
    readonly entityType: K;
    readonly systemId: number;
    readonly identity?: IdentityFor<K>;
  };
}[T];
