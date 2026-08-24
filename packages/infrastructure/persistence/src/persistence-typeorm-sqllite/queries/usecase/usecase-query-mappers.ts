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
import type {
  OverlaidControlLink,
  OverlaidDataLink,
} from '../../fetchers/link-overlay-fetcher.js';

export const UseCaseQueryMappers = {
  mapValueToKeyVector(value: ValueDefinitionRow): KeyValuePairReadModel {
    return {
      key: {
        systemId: value.keys.systemId,
        keyId: value.keys.keyId,
        name: value.keys.name,
      },
      value: {
        systemId: value.systemId,
        valueId: value.valueId,
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
      parentId: node.parentId,
      instanceId: spfModule.instanceId,
      alias: spfModule.alias,
      name: definition.name,
      moduleId: definition.moduleDefinitionId,
      definitionSystemId: spfModule.definitionSystemId,
      subgraphId: spfModule.subgraphSystemId,
      containerId: spfModule.containerSystemId,
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

  mapToComponentDataLinkReadModel(dl: OverlaidDataLink): DataLinkReadModel {
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
    cl: OverlaidControlLink,
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
        portId: port.dataPortId,
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
            intentId: intent.intentId,
            name: `Intent_${intent.intentId}`,
          })) ?? [];
        return {
          systemId: port.systemId,
          portId: port.portId,
          name: port.name ?? null,
          isStatic: port.isStatic,
          allocatedIntents,
          totalLinksAtPort: 0,
        };
      }) ?? []
    );
  },
};
