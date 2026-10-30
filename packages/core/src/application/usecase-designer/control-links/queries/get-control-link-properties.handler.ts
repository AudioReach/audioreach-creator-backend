/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {GetControlLinkPropertiesQuery} from './get-control-link-properties.query.js';
import type {ControlLinkPropertiesDto} from '../dto/control-link-properties-dto.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/index.js';
import {RESULT_KIND} from '../../../shared/result/result.js';
import {CONFIGURATION_INCLUDES} from '../../../ports/persistence/query-services/configuration-includes.js';

const INTENTS_PROP_ID = 0x08_00_10_62;
const HEAP_PROP_ID = 0x08_00_13_6f;
const INTENTS_PROP_NAME = 'Intents Property';
const HEAP_PROP_NAME = 'Heap Property';

type IntentItem = {naturalId: number; name: string};

type EndpointIntents = {
  isModule: boolean;
  allocatedIntents: IntentItem[];
  supportedIntents: IntentItem[];
};

export class GetControlLinkPropertiesHandler implements QueryHandler<
  GetControlLinkPropertiesQuery,
  Promise<ControlLinkPropertiesDto>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetControlLinkPropertiesQuery,
  ): Promise<ControlLinkPropertiesDto> {
    const {controlLinkSystemId, projectId} = query;

    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        projectId,
      );

    // FR-GCL-02: link existence
    const result =
      await this.queryServices.controlLinkQueryService.findBySystemIds(
        [controlLinkSystemId],
        fileSystemId,
      );
    if (result.kind === RESULT_KIND.Fail || result.data.length === 0) {
      throw new ResourceNotFoundException(
        `ControlLink ${controlLinkSystemId} not found`,
      );
    }

    const link = result.data[0];

    const segmentsResult =
      await this.queryServices.controlLinkQueryService.findSubsystemSegments(
        controlLinkSystemId,
        fileSystemId,
      );
    const routeLinks = [
      link,
      ...(segmentsResult.kind === RESULT_KIND.Fail ? [] : segmentsResult.data),
    ];
    const endpoints = new Map<number, number>();
    for (const routeLink of routeLinks) {
      endpoints.set(routeLink.peerNodeASystemId, routeLink.nodeAPortSystemId);
      endpoints.set(routeLink.peerNodeBSystemId, routeLink.nodeBPortSystemId);
    }

    const allocatedIntents: IntentItem[] = [];
    const supportedIntents: IntentItem[] = [];
    let hasModuleEndpoint = false;

    for (const [nodeId, portId] of endpoints) {
      const resolved = await this.resolveEndpointIntents(
        nodeId,
        portId,
        fileSystemId,
      );
      if (!resolved.isModule) continue;
      hasModuleEndpoint = true;
      if (allocatedIntents.length === 0)
        allocatedIntents.push(...resolved.allocatedIntents);
      supportedIntents.push(...resolved.supportedIntents);
    }

    const uniqueSupportedIntents = [
      ...new Map(
        supportedIntents.map(intent => [intent.naturalId, intent]),
      ).values(),
    ];

    const response: ControlLinkPropertiesDto = {
      AllocatedIntents: {
        propNaturalId: INTENTS_PROP_ID,
        propName: INTENTS_PROP_NAME,
        intents: allocatedIntents,
      },
      HeapId: {
        propNaturalId: HEAP_PROP_ID,
        propName: HEAP_PROP_NAME,
        heapId: link.heapId,
      },
    };

    if (hasModuleEndpoint) {
      response.SupportedIntents = {
        propNaturalId: INTENTS_PROP_ID,
        propName: INTENTS_PROP_NAME,
        intents: uniqueSupportedIntents,
      };
    }

    return response;
  }

  private async resolveEndpointIntents(
    nodeId: number,
    portId: number,
    fileSystemId: number,
  ): Promise<EndpointIntents> {
    const endpointModule =
      await this.queryServices.spfModuleQueryService.getSpfModule(
        nodeId,
        fileSystemId,
      );
    if (endpointModule.kind === RESULT_KIND.Fail)
      return {isModule: false, allocatedIntents: [], supportedIntents: []};

    const modulePort = endpointModule.data.controlPorts.find(
      port => port.systemId === portId,
    );
    const allocatedIntents: IntentItem[] =
      modulePort !== undefined
        ? modulePort.allocatedIntents.map(intent => ({
            naturalId: intent.naturalId,
            name: intent.name,
          }))
        : [];

    const defResult =
      await this.queryServices.spfModuleDefinitionQueryService.getDefinition(
        endpointModule.data.definitionSystemId,
        fileSystemId,
        CONFIGURATION_INCLUDES.FullDetails,
      );

    if (defResult.kind === RESULT_KIND.Fail)
      return {isModule: true, allocatedIntents, supportedIntents: []};

    const defData = defResult.data;
    const staticPort =
      modulePort !== undefined
        ? (defData.staticControlPorts ?? []).find(
            sp => sp.naturalId === modulePort.naturalId,
          )
        : undefined;

    const supportedIntents: IntentItem[] = staticPort
      ? (staticPort.staticIntents ?? []).map(si => ({
          naturalId: si.naturalId,
          name: si.name,
        }))
      : (defData.dynamicIntents ?? []).map(di => ({
          naturalId: di.naturalId,
          name: di.name,
        }));

    return {isModule: true, allocatedIntents, supportedIntents};
  }
}
