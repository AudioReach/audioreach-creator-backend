/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  EntityRef,
  LinkEndpoint,
  NamedKeyValue,
  NamedNaturalId,
  PortIdentity,
} from '../../domain/identity/entity-identity.js';
import {ENTITY_TYPE, type EntityType} from '../../shared/entity-type.js';
import {BinaryUtils} from '../../shared/utilities/binary-utils.js';

/** Text labels that differ from the entity type name. */
const LABELS: Partial<Record<EntityType, string>> = {
  SpfModule: 'Module',
  DataPort: 'Data port',
  ControlPort: 'Control port',
  Ckv: 'CKV',
  Tkv: 'TKV',
  KeyDefinition: 'Key',
  ValueDefinition: 'Value',
  TagDefinition: 'Tag',
  SpfModuleDefinition: 'Module definition',
  SpfModuleParameterDefinition: 'Parameter',
};

/**
 * Writes an entity reference as text for issue messages and log descriptions.
 *
 * A reference with an identity is written as its natural identity, starting
 * with the type label, and its `systemId` is not shown. A reference without
 * one is written as `<label> with systemId: 0x...`. A port natural ID is
 * decimal for a data port and hex for a control port. A port on its own is
 * written after its node, as `<node> / <port name>`, or `<node> / port <id>`
 * when it has no name. In a link, a port is written as its name, when it has
 * one, and its natural ID.
 * The formatter is pure: it never looks up an identity.
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
// eslint-disable-next-line sonarjs/cognitive-complexity -- One flat case per entity type
function formatIdentity(ref: EntityRef): string | undefined {
  switch (ref.entityType) {
    case ENTITY_TYPE.UseCase: {
      if (!ref.identity) return undefined;
      const {alias, gkv} = ref.identity;
      return `${label(ref)}${quoted(alias)} ${pairs(gkv)}`;
    }
    case ENTITY_TYPE.SpfModule: {
      if (!ref.identity) return undefined;
      const {alias, definitionName, naturalId} = ref.identity;
      return `${label(ref)} '${alias ?? definitionName}' (${hex(naturalId)})`;
    }
    case ENTITY_TYPE.Container:
      return ref.identity && `${label(ref)} ${hex(ref.identity.naturalId)}`;
    case ENTITY_TYPE.DataPort:
      return ref.identity && portOfNode(ref.identity, dataPortId);
    case ENTITY_TYPE.ControlPort:
      return ref.identity && portOfNode(ref.identity, controlPortId);
    case ENTITY_TYPE.Ckv: {
      if (!ref.identity) return undefined;
      const {module, values} = ref.identity;
      return `${label(ref)} ${pairs(values)} of ${formatRef(module)}`;
    }
    case ENTITY_TYPE.Tag: {
      if (!ref.identity) return undefined;
      const {module, tag} = ref.identity;
      return `${named(label(ref), tag)} on ${formatRef(module)}`;
    }
    case ENTITY_TYPE.Tkv: {
      if (!ref.identity) return undefined;
      const {module, tag, values} = ref.identity;
      return (
        `${label(ref)} ${pairs(values)} of ${named('tag', tag)} ` +
        `on ${formatRef(module)}`
      );
    }
    case ENTITY_TYPE.Subgraph:
    case ENTITY_TYPE.Subsystem:
    case ENTITY_TYPE.KeyDefinition:
    case ENTITY_TYPE.TagDefinition:
    case ENTITY_TYPE.SpfModuleDefinition:
    case ENTITY_TYPE.SpfModuleParameterDefinition:
      return ref.identity && named(label(ref), ref.identity);
    case ENTITY_TYPE.ValueDefinition: {
      if (!ref.identity) return undefined;
      const {key, value} = ref.identity;
      return (
        `${label(ref)} ${key.name}:${value.name} ` +
        `(${hex(key.naturalId)}:${hex(value.naturalId)})`
      );
    }
    case ENTITY_TYPE.DataLink: {
      if (!ref.identity) return undefined;
      const {source, destination} = ref.identity;
      return (
        `${label(ref)} ${endpoint(source, dataPortId)} → ` +
        endpoint(destination, dataPortId)
      );
    }
    case ENTITY_TYPE.ControlLink: {
      if (!ref.identity) return undefined;
      const [first, second] = [...ref.identity.endpoints].sort(
        compareEndpoints,
      );
      return (
        `${label(ref)} ${endpoint(first, controlPortId)} ↔ ` +
        endpoint(second, controlPortId)
      );
    }
    default:
      return undefined;
  }
}

/** Key:value pairs by name, `[Key:Value, …]`, in the given order. */
function pairs(values: readonly NamedKeyValue[]): string {
  const text = values.map(({key, value}) => key.name + ':' + value.name);
  return `[${text.join(', ')}]`;
}

function named(typeLabel: string, {name, naturalId}: NamedNaturalId): string {
  return `${typeLabel} '${name}' (${hex(naturalId)})`;
}

/** Writes a port natural ID: decimal for data ports, hex for control ports. */
type PortIdText = (naturalId: number) => string;

const dataPortId: PortIdText = String;
const controlPortId: PortIdText = naturalId => hex(naturalId);

function endpoint({node, port}: LinkEndpoint, portId: PortIdText): string {
  return `${formatRef(node)} / ${portText(port, portId)}`;
}

/** A port on its own: `<node> / <name>`, or `<node> / port <id>`. */
function portOfNode({node, port}: LinkEndpoint, portId: PortIdText): string {
  const portName = port.name ?? 'port ' + portId(port.naturalId);
  return `${formatRef(node)} / ${portName}`;
}

/** `port 'name' (id)`, or `port id` when the port has no name. */
function portText({name, naturalId}: PortIdentity, portId: PortIdText): string {
  const id = portId(naturalId);
  return name === null ? `port ${id}` : `port '${name}' (${id})`;
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
