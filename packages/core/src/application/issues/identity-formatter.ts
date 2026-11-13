/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  EntityRef,
  LinkEndpoint,
  NamedNaturalId,
  PortIdentity,
} from '../../domain/identity/entity-identity.js';
import type {IssueEntityType} from '../../shared/issues/impacted-entity.js';
import {BinaryUtils} from '../../shared/utilities/binary-utils.js';

/** Text labels that differ from the entity type name. */
const LABELS: Partial<Record<IssueEntityType, string>> = {
  SpfModule: 'Module',
  KeyDefinition: 'Key',
  ValueDefinition: 'Value',
  TagDefinition: 'Tag',
};

/**
 * Writes an entity reference as text for issue messages and log descriptions.
 *
 * A reference with an identity is written as its natural identity, starting
 * with the type label, and its `systemId` is not shown. A reference without
 * one is written as `<label> with systemId: 0x...`. The formatter is pure: it
 * never looks up an identity.
 */
export class IdentityFormatter {
  format(ref: EntityRef): string {
    return formatRef(ref);
  }
}

function formatRef(ref: EntityRef): string {
  return (
    formatIdentity(ref) ?? `${label(ref)} with systemId: ${hex(ref.systemId)}`
  );
}

/** The natural identity of `ref`, or `undefined` when it has none. */
function formatIdentity(ref: EntityRef): string | undefined {
  switch (ref.entityType) {
    case 'UseCase': {
      if (!ref.identity) return undefined;
      const {alias, gkv} = ref.identity;
      const pairs = gkv.map(({key, value}) => `${key.name}:${value.name}`);
      return `${label(ref)}${quoted(alias)} [${pairs.join(', ')}]`;
    }
    case 'SpfModule': {
      if (!ref.identity) return undefined;
      const {alias, definitionName, naturalId} = ref.identity;
      return `${label(ref)} '${alias ?? definitionName}' (${hex(naturalId)})`;
    }
    case 'Subgraph':
    case 'Subsystem':
    case 'KeyDefinition':
    case 'TagDefinition':
      return ref.identity && named(label(ref), ref.identity);
    case 'ValueDefinition': {
      if (!ref.identity) return undefined;
      const {key, value} = ref.identity;
      return (
        `${label(ref)} ${key.name}:${value.name} ` +
        `(${hex(key.naturalId)}:${hex(value.naturalId)})`
      );
    }
    case 'DataLink': {
      if (!ref.identity) return undefined;
      const {source, destination} = ref.identity;
      return `${label(ref)} ${endpoint(source)} → ${endpoint(destination)}`;
    }
    case 'ControlLink': {
      if (!ref.identity) return undefined;
      const [first, second] = [...ref.identity.endpoints].sort(
        compareEndpoints,
      );
      return `${label(ref)} ${endpoint(first)} ↔ ${endpoint(second)}`;
    }
    default:
      return undefined;
  }
}

function named(typeLabel: string, {name, naturalId}: NamedNaturalId): string {
  return `${typeLabel} '${name}' (${hex(naturalId)})`;
}

function endpoint({node, port}: LinkEndpoint): string {
  return `${formatRef(node)} / ${portText(port)}`;
}

function portText({name, naturalId}: PortIdentity): string {
  return name === null ? `port ${hex(naturalId)}` : `port '${name}'`;
}

/**
 * Orders control-link endpoints so the same link always reads the same way:
 * ascending by node natural ID, endpoints without an identity last, then by
 * node systemId and port natural ID.
 */
function compareEndpoints(a: LinkEndpoint, b: LinkEndpoint): number {
  const aId = a.node.identity?.naturalId;
  const bId = b.node.identity?.naturalId;
  if (aId !== bId) {
    if (aId === undefined) return 1;
    if (bId === undefined) return -1;
    return aId - bId;
  }
  return (
    a.node.systemId - b.node.systemId || a.port.naturalId - b.port.naturalId
  );
}

function label(ref: EntityRef): string {
  return LABELS[ref.entityType] ?? ref.entityType;
}

function quoted(alias: string | undefined): string {
  return alias === undefined ? '' : ` '${alias}'`;
}

function hex(value: number): string {
  return BinaryUtils.toHexString(value);
}
