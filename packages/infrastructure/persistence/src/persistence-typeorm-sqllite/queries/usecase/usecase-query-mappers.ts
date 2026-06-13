/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  KeyValuePairReadModel,
  ModuleReadModel,
  DataLinkReadModel,
  ControlLinkReadModel,
  DataPortReadModel,
  ControlPortReadModel,
  IntentReadModel,
} from '@arc/core';
import type {
  ValueDefinitionRow,
  NodeRow,
  DataLinkRow,
  ControlLinkRow,
} from '../../entity-schema/index.js';

/**
 * Mappers for converting database rows to read models for use case queries
 */
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

  mapNodeToModuleReadModel(node: NodeRow): ModuleReadModel {
    const spfModule = node.spfModule!;

    // Map data ports
    const dataPorts: DataPortReadModel[] =
      node.dataPorts?.map(port => ({
        systemId: port.systemId,
        portId: port.dataPortId,
        name: port.name || '',
        portIoType: port.portIoType,
        isStatic: port.isStatic,
        totalLinksAtPort: 0,
      })) || [];

    // Map control ports with intents
    const controlPorts: ControlPortReadModel[] =
      node.controlPorts?.map(port => {
        const allocatedIntents: IntentReadModel[] =
          port.allocatedIntents?.map(intent => ({
            systemId: intent.systemId,
            intentId: intent.intentId,
            name: `Intent_${intent.intentId}`,
          })) || [];

        return {
          systemId: port.systemId,
          portId: port.portId,
          name: port.name || '',
          isStatic: port.isStatic,
          allocatedIntents,
          totalLinksAtPort: 0,
        };
      }) || [];

    return {
      systemId: node.systemId,
      name: spfModule.alias,
      instanceId: spfModule.systemId,
      definitionSystemId: spfModule.definitionSystemId,
      container: {
        systemId: spfModule.container!.systemId,
        type: spfModule.container!.type,
      },
      subgraph: {
        systemId: spfModule.subgraph!.systemId,
        name: spfModule.subgraph!.name,
      },
      dataPorts,
      controlPorts,
    };
  },

  mapToDataLinkReadModel(dataLink: DataLinkRow): DataLinkReadModel {
    return {
      systemId: dataLink.systemId,
      sourceNodeSystemId: dataLink.sourceNodeSystemId,
      destinationNodeSystemId: dataLink.destinationNodeSystemId,
      sourcePortSystemId: dataLink.sourcePortSystemId,
      destinationPortSystemId: dataLink.destinationPortSystemId,
      linkType: dataLink.linkType,
      isEc: dataLink.isEc,
    };
  },

  mapToControlLinkReadModel(controlLink: ControlLinkRow): ControlLinkReadModel {
    return {
      systemId: controlLink.systemId,
      peerNodeASystemId: controlLink.peerNodeASystemId,
      peerNodeBSystemId: controlLink.peerNodeBSystemId,
      nodeAPortSystemId: controlLink.nodeAPortSystemId,
      nodeBPortSystemId: controlLink.nodeBPortSystemId,
      heapId: controlLink.heapId,
      linkType: controlLink.linkType,
    };
  },
};
