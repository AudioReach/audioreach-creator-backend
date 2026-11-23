/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {NaturalIdGenerationPort} from '../../../ports/id-generation/natural-id-generation.port.js';
import {NaturalIdType} from '../../../../domain/services/natural-id-generator/natural-id-type.js';
import {ResourceNotFoundException} from '../../../shared/exceptions/resource-not-found.exception.js';
import {DomainRuleViolationException} from '../../../shared/exceptions/domain-rule-violation.exception.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import {requireOne} from '../../../shared/result/require-one.js';
import {SpfModule} from '../../../../domain/entities/usecase-data/module/spf-module.js';
import {DataPort} from '../../../../domain/entities/usecase-data/node/entities/data-port.js';
import {ControlPort} from '../../../../domain/entities/usecase-data/node/entities/control-port.js';
import {buildSubgraphWithDefaults} from '../../subgraph/build-subgraph-with-defaults.js';
import {buildContainerWithDefaults} from '../../container/build-container-with-defaults.js';
import {decodeCapabilityList} from '../../shared/utils/container-stack-size-codec.js';
import {CONTAINER_PROP_ID_CAPABILITY_LIST} from '../../../../domain/entities/definitions/container/container-property-ids.js';
import {createZeroCkv} from '../shared/kv-seed-helpers.js';
import type {CreateModuleCommand} from './create-module.command.js';
import {CONFIGURATION_INCLUDES} from '../../../ports/persistence/query-services/configuration-includes.js';
import {ContainerStackSizeService} from '../../container/services/container-stack-size.service.js';

export class CreateModuleHandler implements CommandHandler<
  CreateModuleCommand,
  {groupId: string; moduleSystemId: number}
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
    private readonly naturalIdGeneration: NaturalIdGenerationPort,
    private readonly logger?: Logger,
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
      const definition = await defRepo.findByDefIdAndProcId(
        command.moduleDefinitionSystemId,
        command.processorSystemId,
        fileSystemId,
      );
      if (!definition) {
        throw new ResourceNotFoundException(
          `SpfModuleDefinition with moduleDefinitionSystemId=${command.moduleDefinitionSystemId} processorSystemId=${command.processorSystemId} not found.`,
        );
      }

      const processorNaturalId = await defRepo.getProcessorNaturalId(
        definition.processorSystemId,
        fileSystemId,
      );
      if (processorNaturalId === null) {
        throw new ResourceNotFoundException(
          `Processor natural ID not found for processor system ID ${definition.processorSystemId}.`,
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
      const {containerSystemId, isNew} = await this.resolveContainer(
        command,
        fileSystemId,
        processorNaturalId,
        definition.stackSize,
        definition.containerTypesSystemIds,
      );

      // 4.5 Update the container's stack size — skipped for new containers
      // because buildContainerWithDefaults already seeds the correct value.
      if (!isNew) {
        await new ContainerStackSizeService(uow).updateOnAdd(
          containerSystemId,
          definition.stackSize,
          fileSystemId,
        );
      }

      // 5. Materialize static data ports from definition (IDs from definition, not NaturalIdPort)
      const dataPorts: DataPort[] = [];
      for (const group of definition.dataPortGroups) {
        for (const portDef of group.staticPortDefinitions) {
          dataPorts.push(
            new DataPort({
              systemId: await this.idGeneration.getNextId(fileSystemId),
              naturalId: portDef.naturalId,
              portIoType: group.portIoType,
              isStatic: true,
              name: portDef.name,
            }),
          );
        }
      }

      // 6. Allocate module systemId + instanceNaturalId
      const moduleSystemId = await this.idGeneration.getNextId(fileSystemId);
      const instanceNaturalId = this.naturalIdGeneration.getNextId(
        fileSystemId,
        NaturalIdType.MODINSTANCE,
      );

      // 7. Materialize static control ports from definition
      const controlPorts: ControlPort[] = [];
      for (const portDef of definition.staticControlPorts) {
        controlPorts.push(
          new ControlPort({
            systemId: await this.idGeneration.getNextId(fileSystemId),
            naturalId: portDef.naturalId,
            isStatic: true,
            nodeSystemId: moduleSystemId,
            name: portDef.portName,
            intentSystemIds: [],
          }),
        );
      }

      const module = new SpfModule({
        systemId: moduleSystemId,
        naturalId: instanceNaturalId,
        definitionSystemId: definition.systemId,
        containerSystemId,
        subgraphSystemId,
        fileSystemId,
        parentSystemId: command.parentSystemId ?? undefined,
        dataPorts,
        controlPorts,
      });

      // 8. Stage all rows atomically; groupId remains response correlation.
      await uow.getModuleRepository().createModule(module);

      // 10. Seed zero-CKV with default calibration parameters.
      await createZeroCkv(
        definition.systemId,
        fileSystemId,
        moduleSystemId,
        uow.getModuleRepository(),
        defRepo,
        this.idGeneration,
        this.logger,
      );

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
      const subgraphNaturalId = this.naturalIdGeneration.getNextId(
        fileSystemId,
        NaturalIdType.SUBGRAPH,
      );
      const sgPropDefs =
        await subgraphRepo.getPropertyDefinitions(fileSystemId);
      const subgraph = buildSubgraphWithDefaults(
        {
          systemId: subgraphSystemId,
          subgraphNaturalId,
          name: `SG_${subgraphNaturalId.toString(16).toUpperCase()}`,
          fileSystemId,
        },
        sgPropDefs,
        this.logger,
      );
      for (const property of subgraph.properties) {
        property.systemId = await this.idGeneration.getNextId(fileSystemId);
      }
      await subgraphRepo.createSubgraph(subgraph);
      return subgraphSystemId;
    }
    requireOne(
      await subgraphRepo.findSubgraphs(
        fileSystemId,
        [command.subgraphSystemId],
        CONFIGURATION_INCLUDES.Summary,
      ),
    );
    return command.subgraphSystemId;
  }

  private async resolveContainer(
    command: CreateModuleCommand,
    fileSystemId: number,
    processorNaturalId: number,
    stackSize: number,
    moduleContainerTypesSystemIds: Set<number>,
  ): Promise<{containerSystemId: number; isNew: boolean}> {
    const containerRepo = this.uow.getContainerRepository();
    if (command.containerSystemId === null) {
      const firstContainerTypeSystemId: number | undefined =
        moduleContainerTypesSystemIds.values().next().value;
      if (firstContainerTypeSystemId === undefined) {
        throw new ResourceNotFoundException(
          `Module definition has no container types configured. Cannot auto-create a container.`,
        );
      }
      // Look up the domain value (natural ID) of the first container type for
      // CAPABILITY_LIST — the definition stores DB system IDs, SPF needs ContainerType.value.
      const valuesMap = await this.uow
        .getModuleDefinitionRepository()
        .getContainerTypeValues([firstContainerTypeSystemId]);
      const capabilityNaturalId = valuesMap.get(firstContainerTypeSystemId);
      const containerSystemId = await this.idGeneration.getNextId(fileSystemId);
      const containerNaturalId = this.naturalIdGeneration.getNextId(
        fileSystemId,
        NaturalIdType.CONTAINER,
      );
      const ctrPropDefs =
        await containerRepo.getPropertyDefinitions(fileSystemId);
      const container = buildContainerWithDefaults(
        {
          systemId: containerSystemId,
          containerNaturalId,
          fileSystemId,
          procDomainNaturalId: processorNaturalId,
          capabilitySystemIds:
            capabilityNaturalId !== undefined ? [capabilityNaturalId] : [],
          stackSize,
        },
        ctrPropDefs,
        this.logger,
      );
      await containerRepo.createContainer(container);
      return {containerSystemId, isNew: true};
    }
    const container = await containerRepo.getContainerById(
      command.containerSystemId,
      fileSystemId,
    );
    if (!container) {
      throw new ResourceNotFoundException(
        `Container ${command.containerSystemId} not found.`,
      );
    }

    // Derive container capability from CAPABILITY_LIST property blob
    const capPropDef = await containerRepo.getPropertyDefinitionByPropertyId(
      fileSystemId,
      CONTAINER_PROP_ID_CAPABILITY_LIST,
    );
    if (!capPropDef) {
      throw new ResourceNotFoundException(
        `Capability list property definition not found for file ${fileSystemId}.`,
      );
    }
    const capBlob =
      container.properties.get(capPropDef.systemId)?.getPayloadCopy() ?? null;
    const containerCapValues = decodeCapabilityList(capBlob);

    // Map module container type system IDs → domain values, then check intersection
    const moduleTypeValuesMap = await this.uow
      .getModuleDefinitionRepository()
      .getContainerTypeValues([...moduleContainerTypesSystemIds]);
    const moduleCapValueSet = new Set(moduleTypeValuesMap.values());
    const hasMatch = containerCapValues.some(v => moduleCapValueSet.has(v));

    if (!hasMatch) {
      throw new DomainRuleViolationException([
        IssueFactory.containerTypeIncompatible(
          command.containerSystemId,
          null,
          [...moduleContainerTypesSystemIds],
        ),
      ]);
    }
    return {containerSystemId: command.containerSystemId, isNew: false};
  }
}
