/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  UnitOfWork,
  IdGenerationPort,
  NaturalIdGenerationPort,
} from '@arc/core';
import {ResourceNotFoundException, NaturalIdType} from '@arc/core';
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import {SpfModule} from '../../../../domain/entities/usecase-data/module/spf-module.js';
import {DataPort} from '../../../../domain/entities/usecase-data/node/entities/data-port.js';
import {ControlPort} from '../../../../domain/entities/usecase-data/node/entities/control-port.js';
import {buildSubgraphWithDefaults} from '../../subgraph/build-subgraph-with-defaults.js';
import {buildContainerWithDefaults} from '../../container/build-container-with-defaults.js';
import type {CreateModuleCommand} from './create-module.command.js';

export class CreateModuleHandler implements CommandHandler<
  CreateModuleCommand,
  {groupId: string; moduleSystemId: number}
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
    private readonly naturalIdGeneration: NaturalIdGenerationPort,
  ) {}

  async handle(
    command: CreateModuleCommand,
  ): Promise<{groupId: string; moduleSystemId: number}> {
    const uow = this.uow;
    await uow.startTransaction();
    try {
      const fileSystemId = uow.getWriteContext().session.fileSystemId;
      const defRepo = uow.getModuleDefinitionRepository();

      // 1. Load module definition — 404 on miss
      const definition = await defRepo.findByModuleIdAndProcId(
        command.moduleDefinitionId,
        command.processorSystemId,
        fileSystemId,
      );
      if (!definition) {
        throw new ResourceNotFoundException(
          `SpfModuleDefinition with moduleDefinitionId=${command.moduleDefinitionId} processorSystemId=${command.processorSystemId} not found.`,
        );
      }

      // 2. Optional parent subsystem existence check
      if (command.parentSystemId !== null) {
        const found = await uow
          .getSubsystemRepository()
          .subsystemExists(command.parentSystemId, fileSystemId);
        if (!found) {
          throw new ResourceNotFoundException(
            `Subsystem ${command.parentSystemId} not found.`,
          );
        }
      }

      // 3 & 4. Subgraph + Container resolution (auto-create or validate)
      const subgraphSystemId = await this.resolveSubgraph(
        command,
        fileSystemId,
      );
      const containerSystemId = await this.resolveContainer(
        command,
        fileSystemId,
        [...definition.containerTypesSystemIds][0],
      );

      // 5. Materialize static data ports from definition (IDs from definition, not NaturalIdPort)
      const dataPorts: DataPort[] = [];
      for (const group of definition.dataPortGroups) {
        for (const portDef of group.staticPortDefinitions) {
          dataPorts.push(
            new DataPort({
              systemId: await this.idGeneration.getNextId(fileSystemId),
              dataPortId: portDef.dataPortId,
              portIoType: group.portIoType,
              isStatic: true,
              name: portDef.name,
            }),
          );
        }
      }

      // 6. Allocate module systemId + instanceId
      const moduleSystemId = await this.idGeneration.getNextId(fileSystemId);
      const instanceId = this.naturalIdGeneration.getNextId(
        fileSystemId,
        NaturalIdType.MODINSTANCE,
      );

      // 7. Materialize static control ports from definition
      const controlPorts: ControlPort[] = [];
      for (const portDef of definition.staticControlPorts) {
        controlPorts.push(
          new ControlPort({
            systemId: await this.idGeneration.getNextId(fileSystemId),
            portId: portDef.portId,
            isStatic: true,
            nodeSystemId: moduleSystemId,
            name: portDef.portName,
            intentSystemIds: [],
          }),
        );
      }

      const module = new SpfModule({
        systemId: moduleSystemId,
        instanceId,
        definitionSystemId: definition.systemId,
        containerSystemId,
        subgraphSystemId,
        fileSystemId,
        parentSystemId: command.parentSystemId ?? undefined,
        dataPorts,
        controlPorts,
      });

      // 8. Stage all rows atomically — all share the ambient groupId
      await uow.getModuleRepository().createModule(module);

      // Step 10: TODO(add-module-calibration-defaults) — zero CKV with default
      // calibration parameter payloads for this module.
      //
      //   const calibParams = await defRepo.findCalibrationParametersByDefinitionId(
      //     definition.systemId, fileSystemId,
      //   );
      //   if (calibParams.length > 0) {
      //     const ckvSystemId = await this.idGeneration.getNextId(fileSystemId);
      //     const kvData = new KvData({systemId: ckvSystemId, valueDefinitionSystemIds: [], uiPersistence: null});
      //     for (const param of calibParams) {
      //       const blob = serializeDefaultParameterData(param.elementsStructure);
      //       const payloadSystemId = await this.idGeneration.getNextId(fileSystemId);
      //       kvData.addParameterPayload(new ModuleParameterData({
      //         systemId: payloadSystemId, paramDefintionSystemId: param.systemId, payload: blob,
      //       }));
      //     }
      //     await uow.getModuleRepository().createCkv(kvData, moduleSystemId);
      //   }
      //
      // See: docs/edit-crud/design/add-module-calibration-defaults-design.md §9 Step 10

      await uow.commit();
      return {groupId: uow.getWriteContext().groupId, moduleSystemId};
    } catch (error) {
      if (uow.isInTransaction()) await uow.rollback();
      throw error;
    }
  }

  private async resolveSubgraph(
    command: CreateModuleCommand,
    fileSystemId: number,
  ): Promise<number> {
    const subgraphRepo = this.uow.getSubgraphRepository();
    if (command.subgraphSystemId === null) {
      const subgraphSystemId = await this.idGeneration.getNextId(fileSystemId);
      const subgraphId = this.naturalIdGeneration.getNextId(
        fileSystemId,
        NaturalIdType.SUBGRAPH,
      );
      const sgPropDefs = await this.uow
        .getPropertyDefinitionsRepository()
        .findSubgraphPropertyDefinitions(fileSystemId);
      const subgraph = buildSubgraphWithDefaults(
        {
          systemId: subgraphSystemId,
          subgraphId,
          name: `SG_${subgraphId.toString(16).toUpperCase()}`,
          fileSystemId,
        },
        sgPropDefs,
      );
      await subgraphRepo.createSubgraph(subgraph);
      return subgraphSystemId;
    }
    const found = await subgraphRepo.subgraphExists(
      command.subgraphSystemId,
      fileSystemId,
    );
    if (!found) {
      throw new ResourceNotFoundException(
        `Subgraph ${command.subgraphSystemId} not found.`,
      );
    }
    return command.subgraphSystemId;
  }

  private async resolveContainer(
    command: CreateModuleCommand,
    fileSystemId: number,
    containerTypeSystemId: number | undefined,
  ): Promise<number> {
    const containerRepo = this.uow.getContainerRepository();
    if (command.containerSystemId === null) {
      if (!containerTypeSystemId) {
        throw new ResourceNotFoundException(
          `Module definition has no container types configured. Cannot auto-create a container.`,
        );
      }
      const containerSystemId = await this.idGeneration.getNextId(fileSystemId);
      const containerId = this.naturalIdGeneration.getNextId(
        fileSystemId,
        NaturalIdType.CONTAINER,
      );
      const ctrPropDefs = await this.uow
        .getPropertyDefinitionsRepository()
        .findContainerPropertyDefinitions(fileSystemId);
      const container = buildContainerWithDefaults(
        {
          systemId: containerSystemId,
          containerId,
          containerTypeSystemId,
          fileSystemId,
        },
        ctrPropDefs,
      );
      await containerRepo.createContainer(container);
      return containerSystemId;
    }
    const found = await containerRepo.containerExists(
      command.containerSystemId,
      fileSystemId,
    );
    if (!found) {
      throw new ResourceNotFoundException(
        `Container ${command.containerSystemId} not found.`,
      );
    }
    return command.containerSystemId;
  }
}
