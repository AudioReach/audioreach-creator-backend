/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ENTITY_TYPE, EntityType} from '../../shared/entity-type.js';

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

/**
 * A port with the node that owns it. It is the identity of a data or control
 * port, and one end of a link: the node it connects to and the port it uses.
 */
export interface LinkEndpoint {
  readonly node:
    | EntityRef<typeof ENTITY_TYPE.SpfModule>
    | EntityRef<typeof ENTITY_TYPE.Subsystem>;
  readonly port: PortIdentity;
}

/** The module that owns a CKV, a tag, or a TKV. */
type OwningModule = EntityRef<typeof ENTITY_TYPE.SpfModule>;

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
  /** Containers have no name. */
  Container: {readonly naturalId: number};
  Subsystem: NamedNaturalId;
  DataPort: LinkEndpoint;
  ControlPort: LinkEndpoint;
  DataLink: {readonly source: LinkEndpoint; readonly destination: LinkEndpoint};
  /** A control link has no direction; the formatter orders its endpoints. */
  ControlLink: {readonly endpoints: readonly [LinkEndpoint, LinkEndpoint]};
  /** Values in the order of the CKV's key vector. */
  Ckv: {
    readonly module: OwningModule;
    readonly values: readonly NamedKeyValue[];
  };
  Tag: {readonly module: OwningModule; readonly tag: NamedNaturalId};
  /** Values in the order of the TKV's key vector. */
  Tkv: {
    readonly module: OwningModule;
    readonly tag: NamedNaturalId;
    readonly values: readonly NamedKeyValue[];
  };
  KeyDefinition: NamedNaturalId;
  ValueDefinition: NamedKeyValue;
  TagDefinition: NamedNaturalId;
  SpfModuleDefinition: NamedNaturalId;
  SpfModuleParameterDefinition: NamedNaturalId;
}

/** The identity of entity type `T`, or `never` if `T` has none. */
export type IdentityFor<T extends EntityType> =
  T extends keyof EntityIdentityMap ? EntityIdentityMap[T] : never;

/**
 * A reference to an entity. `systemId` is for machines (selection, follow-up
 * commands); `identity` is what text shows. `identity` is missing when the
 * entity was not found or its identity could not be read.
 */
export type EntityRef<T extends EntityType = EntityType> = {
  [K in T]: {
    readonly entityType: K;
    readonly systemId: number;
    readonly identity?: IdentityFor<K>;
  };
}[T];

/**
 * An `EntityRef` whose `identity` is always present.
 *
 * `EntityRef.identity` is optional because a reference may point at an entity
 * whose identity could not be read. A `find…Identities` read returns only the
 * entities it found (the rest go to `BatchRead.failed`), so each of its items
 * has an identity; this type says so, and callers need no `identity` check.
 *
 * An item can be used directly where an `EntityRef` is expected. Each item
 * carries its own `entityType`, so refs from reads of different types (for
 * example the SpfModule and Subsystem nodes of a chain) can be merged into
 * one list or map without being rebuilt.
 */
export type IdentifiedEntityRef<T extends keyof EntityIdentityMap> = {
  [K in T]: {
    readonly entityType: K;
    readonly systemId: number;
    readonly identity: IdentityFor<K>;
  };
}[T];
