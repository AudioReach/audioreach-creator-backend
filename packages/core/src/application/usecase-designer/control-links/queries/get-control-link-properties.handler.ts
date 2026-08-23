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

const INTENTS_PROP_ID = 0x08001062;
const HEAP_PROP_ID = 0x0800136f;
const INTENTS_PROP_NAME = 'Intents Property';
const HEAP_PROP_NAME = 'Heap Property';

export class GetControlLinkPropertiesHandler implements QueryHandler<
  GetControlLinkPropertiesQuery,
  Promise<ControlLinkPropertiesDto>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: GetControlLinkPropertiesQuery): Promise<ControlLinkPropertiesDto> {
    const {controlLinkSystemId, projectId} = query;

    const fileSystemId = await this.queryServices.projectQueryService.getFileIdByProjectId(projectId);

    // FR-GCL-02: link existence
    const result = await this.queryServices.controlLinkQueryService.findBySystemIds(
      [controlLinkSystemId],
      fileSystemId,
    );
    if (result.kind === RESULT_KIND.Fail || result.data.length === 0) {
      throw new ResourceNotFoundException(`ControlLink ${controlLinkSystemId} not found`);
    }

    const link = result.data[0]!;

    // Get allocated intents from nodeA port
    const portResult = await this.queryServices.spfModuleQueryService.nodeQueryService.getControlPorts(
      link.peerNodeASystemId,
      fileSystemId,
    );

    const allocatedIntents: {id: number; name: string}[] = [];
    const supportedIntents: {id: number; name: string}[] = [];

    if (portResult.kind !== RESULT_KIND.Fail) {
      const port = portResult.data.find(p => p.systemId === link.nodeAPortSystemId);
      if (port) {
        for (const intent of port.allocatedIntents) {
          allocatedIntents.push({id: intent.intentId, name: intent.name});
        }
      }
    }

    // Get supported intents from module definition (if module node)
    const moduleResult = await this.queryServices.spfModuleQueryService
      .findOne(link.peerNodeASystemId, fileSystemId)
      .catch(() => null);

    if (moduleResult !== null) {
      const defResult = await this.queryServices.spfModuleDefinitionQueryService.getDefinition(
        moduleResult.definitionSystemId,
        fileSystemId,
        CONFIGURATION_INCLUDES.FullDetails,
      );

      if (defResult.kind !== RESULT_KIND.Fail) {
        const defData = defResult.data;
        const portRm = (await this.queryServices.spfModuleQueryService.nodeQueryService.getControlPorts(
          link.peerNodeASystemId,
          fileSystemId,
        ));

        if (portRm.kind !== RESULT_KIND.Fail) {
          const portRmVal = portRm.data.find(p => p.systemId === link.nodeAPortSystemId);
          if (portRmVal) {
            const staticPort = (defData.staticControlPorts ?? []).find(sp => sp.portId === portRmVal.portId);
            if (staticPort) {
              for (const si of staticPort.staticIntents ?? []) {
                supportedIntents.push({id: si.intentId, name: si.name});
              }
            } else {
              for (const di of defData.dynamicIntents ?? []) {
                supportedIntents.push({id: di.intentId, name: di.name});
              }
            }
          }
        }
      }
    }

    const response: ControlLinkPropertiesDto = {
      AllocatedIntents: {
        propId: INTENTS_PROP_ID,
        propName: INTENTS_PROP_NAME,
        intents: allocatedIntents,
      },
      HeapId: {
        propId: HEAP_PROP_ID,
        propName: HEAP_PROP_NAME,
        heapId: link.heapId,
      },
    };

    if (supportedIntents.length > 0) {
      response.SupportedIntents = {
        propId: INTENTS_PROP_ID,
        propName: INTENTS_PROP_NAME,
        intents: supportedIntents,
      };
    }

    return response;
  }
}
