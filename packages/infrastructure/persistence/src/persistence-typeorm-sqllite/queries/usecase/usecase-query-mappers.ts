/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  KeyValuePairReadModel,
  SpfModuleReadModel,
  DataPortReadModel,
  ControlPortReadModel,
  IntentReadModel,
  DataLinkReadModel,
  ControlLinkReadModel,
} from '@arc/core';
import {PORT_IO_TYPE} from '@arc/core';
import type {ValueDefinitionRow, NodeRow} from '../../entity-schema/index.js';
import type {ControlLinkBase} from '../../entity-schema/usecase-data/Links/control-link.js';
import type {DataLinkBase} from '../../entity-schema/usecase-data/Links/data-link.js';

export const UseCaseQueryMappers = {
  mapValueToKeyVector(value: ValueDefinitionRow): KeyValuePairReadModel {
    return {
      key: {
        systemId: value.keys.systemId,
        naturalId: value.keys.naturalId,
        name: value.keys.name,
      },
      value: {
        systemId: value.systemId,
        naturalId: value.naturalId,
        name: value.name,
      },
    };
  },

  // ── Module mappers ────────────────────────────────────────────────────────────

  mapNodeToSpfModuleReadModel(node: NodeRow): SpfModuleReadModel {
    const spfModule = node.spfModule!;
    const definition = spfModule.definition!;
    const portGroups = definition.dataPortGroups ?? [];
    const dataPorts = UseCaseQueryMappers.buildDataPorts(node);
    const controlPorts = UseCaseQueryMappers.buildControlPorts(node);

    return {
      systemId: node.systemId,
      parentSystemId: node.parentSystemId,
      naturalId: spfModule.naturalId,
      alias: spfModule.alias ?? '',
      name: definition.name,
      moduleDefinitionNaturalId: definition.naturalId,
      definitionSystemId: spfModule.definitionSystemId,
      subgraphSystemId: spfModule.subgraphSystemId,
      containerSystemId: spfModule.containerSystemId,
      maxInputPortsSupported: portGroups
        .filter(g => g.portIoType === PORT_IO_TYPE.Input)
        .reduce((s, g) => s + g.maxAllowedPortCount, 0),
      maxOutputPortsSupported: portGroups
        .filter(g => g.portIoType === PORT_IO_TYPE.Output)
        .reduce((s, g) => s + g.maxAllowedPortCount, 0),
      maxControlPortsSupported: definition.staticPorts?.length ?? 0,
      dataPorts,
      controlPorts,
    };
  },

  // ── Link mappers ──────────────────────────────────────────────────────────────

  mapToComponentDataLinkReadModel(dl: DataLinkBase): DataLinkReadModel {
    return {
      systemId: dl.systemId,
      sourceNodeSystemId: dl.sourceNodeSystemId,
      destinationNodeSystemId: dl.destinationNodeSystemId,
      sourcePortSystemId: dl.sourcePortSystemId,
      destinationPortSystemId: dl.destinationPortSystemId,
      linkType: dl.linkType,
      isEc: dl.isEc,
    };
  },

  mapToComponentControlLinkReadModel(
    cl: ControlLinkBase,
  ): ControlLinkReadModel {
    return {
      systemId: cl.systemId,
      peerNodeASystemId: cl.peerNodeASystemId,
      peerNodeBSystemId: cl.peerNodeBSystemId,
      nodeAPortSystemId: cl.nodeAPortSystemId,
      nodeBPortSystemId: cl.nodeBPortSystemId,
      heapId: cl.heapId,
      linkType: cl.linkType,
    };
  },

  // ── Private port builders ─────────────────────────────────────────────────────

  buildDataPorts(node: NodeRow): DataPortReadModel[] {
    return (
      node.dataPorts?.map(port => ({
        systemId: port.systemId,
        naturalId: port.naturalId,
        name: port.name ?? null,
        portIoType: port.portIoType,
        isStatic: port.isStatic,
        totalLinksAtPort: 0,
      })) ?? []
    );
  },

  buildControlPorts(node: NodeRow): ControlPortReadModel[] {
    return (
      node.controlPorts?.map(port => {
        const allocatedIntents: IntentReadModel[] =
          port.allocatedIntents?.map(intent => ({
            systemId: intent.systemId,
            naturalId: intent.naturalId,
            name: `Intent_${intent.naturalId}`,
          })) ?? [];
        return {
          systemId: port.systemId,
          naturalId: port.naturalId,
          name: port.name ?? null,
          isStatic: port.isStatic,
          allocatedIntents,
          totalLinksAtPort: 0,
        };
      }) ?? []
    );
  },
};
