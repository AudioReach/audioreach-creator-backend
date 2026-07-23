/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  UnitOfWork,
  IdGenerationPort,
  SpfModule,
  PortIoType,
} from '@arc/core';
import {
  ISSUE_ENTITY_TYPE,
  ResourceNotFoundException,
  InvalidOperationException,
  DomainRuleViolationException,
  PORT_IO_TYPE,
} from '@arc/core';
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {CONTAINER_PROP_ID_STACK_SIZE} from '../../../file-operations/shared/constants/spf-ids.js';
import {buildContainerCopy} from '../../container/build-container-copy.js';
import {DataPort} from '../../../../domain/entities/usecase-data/node/entities/data-port.js';
import {ControlPort} from '../../../../domain/entities/usecase-data/node/entities/control-port.js';
import {resolvePortCountChange} from './resolve-port-count-change.js';
import {RESULT_KIND} from '../../../shared/result/result.js';
import type {PatchSpfModuleCommand} from './patch-spf-module.command.js';

function containerPropertyPayloadsMatch(
  src: Uint8Array | null,
  dst: Uint8Array | null,
): boolean {
  if (src === null && dst === null) return true;
  if (src === null || dst === null) return false;
  return src.length === dst.length && src.every((b, i) => b === dst[i]);
}

export class PatchSpfModuleHandler implements CommandHandler<
  PatchSpfModuleCommand,
  {groupId: string}
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async handle(command: PatchSpfModuleCommand): Promise<{groupId: string}> {
    const uow = this.uow;

    // Validate at least one field provided (moves validation here, not controller)
    if (
      command.alias === undefined &&
      command.containerId === undefined &&
      command.maxInputPortsSupported === undefined &&
      command.maxOutputPortsSupported === undefined &&
      command.maxControlPortsSupported === undefined
    ) {
      throw new InvalidOperationException(
        'At least one field must be provided to patch.',
      );
    }

    await uow.startTransaction();
    try {
      const moduleRepo = uow.getModuleRepository();
      const fileSystemId = uow.getWriteContext().session.fileSystemId;
      const {spfModuleSystemId} = command;

      const module = await moduleRepo.findModuleForPatch(
        spfModuleSystemId,
        fileSystemId,
      );
      if (module === null) {
        throw new ResourceNotFoundException(
          `SpfModule ${spfModuleSystemId} not found.`,
        );
      }

      if (command.alias !== undefined) {
        await moduleRepo.renameModule(spfModuleSystemId, command.alias);
      }
      if (command.containerId !== undefined) {
        await this.applyContainerChange(command.containerId, module);
      }
      if (command.maxInputPortsSupported !== undefined) {
        await this.applyDataPortCountChange(
          module,
          PORT_IO_TYPE.Input,
          command.maxInputPortsSupported,
        );
      }
      if (command.maxOutputPortsSupported !== undefined) {
        await this.applyDataPortCountChange(
          module,
          PORT_IO_TYPE.Output,
          command.maxOutputPortsSupported,
        );
      }
      if (command.maxControlPortsSupported !== undefined) {
        await this.applyControlPortCountChange(
          module,
          command.maxControlPortsSupported,
        );
      }

      await uow.commit();
      return {groupId: uow.getWriteContext().groupId};
    } catch (error) {
      if (uow.isInTransaction()) await uow.rollback();
      throw error;
    }
  }

  private async applyContainerChange(
    newContainerId: number,
    module: SpfModule,
  ): Promise<void> {
    const uow = this.uow;
    const containerRepo = uow.getContainerRepository();
    const defRepo = uow.getModuleDefinitionRepository();
    const moduleRepo = uow.getModuleRepository();
    const fileSystemId = uow.getWriteContext().session.fileSystemId;

    const currentContainer = await containerRepo.getContainerById(
      module.containerSystemId,
      fileSystemId,
    );
    if (!currentContainer) {
      throw new ResourceNotFoundException(
        `Existing container ${module.containerSystemId} not found.`,
      );
    }

    let targetContainer = await containerRepo.getContainerById(
      newContainerId,
      fileSystemId,
    );
    if (!targetContainer) {
      const newContainer = buildContainerCopy(
        currentContainer,
        newContainerId,
        newContainerId,
        fileSystemId,
      );
      await containerRepo.createContainer(newContainer);
      targetContainer = newContainer;
    } else {
      for (const [propId, propVal] of currentContainer.properties) {
        if (propId === CONTAINER_PROP_ID_STACK_SIZE) continue;
        const targetProp = targetContainer.properties.get(propId);
        const srcPayload = propVal.getPayloadCopy();
        const dstPayload = targetProp?.getPayloadCopy() ?? null;
        const same = containerPropertyPayloadsMatch(srcPayload, dstPayload);
        if (!same) {
          throw new DomainRuleViolationException([
            IssueFactory.containerPropMismatch(newContainerId),
          ]);
        }
      }
    }

    const definition = await defRepo.findBySystemId(
      module.definitionSystemId,
      fileSystemId,
    );
    if (!definition) {
      throw new ResourceNotFoundException(
        `SpfModuleDefinition ${module.definitionSystemId} not found.`,
      );
    }

    if (
      !definition.containerTypesSystemIds.has(
        targetContainer.containerTypeSystemId,
      )
    ) {
      throw new DomainRuleViolationException([
        IssueFactory.containerTypeIncompatible(
          newContainerId,
          targetContainer.containerTypeSystemId,
          [...definition.containerTypesSystemIds],
        ),
      ]);
    }

    await moduleRepo.changeContainer(module.systemId, newContainerId);

    // Add TODO: recalculate stack size for containerID change - set this property
  }

  // TODO: portID should generated based on port strategy defined in workspace file
  //  and it should re-use freed ports for that module
  private async applyDataPortCountChange(
    module: SpfModule,
    ioType: Extract<
      PortIoType,
      typeof PORT_IO_TYPE.Input | typeof PORT_IO_TYPE.Output
    >,
    requested: number,
  ): Promise<void> {
    const uow = this.uow;
    const fileSystemId = uow.getWriteContext().session.fileSystemId;

    const currentPorts = module.dataPorts.filter(p => p.portIoType === ioType);
    const links = await uow.getDataLinkRepository().getLinksByPortSystemIds(
      currentPorts.map(p => p.systemId),
      fileSystemId,
    );

    const definition = await uow
      .getModuleDefinitionRepository()
      .findBySystemId(module.definitionSystemId, fileSystemId);
    if (!definition) {
      throw new ResourceNotFoundException(
        `SpfModuleDefinition ${module.definitionSystemId} not found.`,
      );
    }

    const portGroup = definition.dataPortGroups.find(
      g => g.portIoType === ioType,
    );
    const outcome = resolvePortCountChange(
      currentPorts,
      requested,
      portGroup?.maxAllowedPortCount ?? 0,
      links,
      ISSUE_ENTITY_TYPE.DataPort,
      module.systemId,
    );
    if (outcome.kind === RESULT_KIND.Fail) {
      throw new DomainRuleViolationException([...outcome.issues]);
    }

    const {toAdd, toRemove} = outcome.data;
    const moduleRepo = uow.getModuleRepository();
    for (let i = 0; i < toAdd; i++) {
      const portDef = portGroup?.staticPortDefinitions[currentPorts.length + i];
      await moduleRepo.addDataPort(
        new DataPort({
          systemId: await this.idGeneration.getNextId(fileSystemId),
          dataPortId: portDef?.dataPortId ?? 0,
          portIoType: ioType,
          isStatic: true,
          name: portDef?.name,
        }),
        module.systemId,
      );
    }
    for (const portSystemId of toRemove) {
      await moduleRepo.removeDataPort(portSystemId, module.systemId);
    }
  }

  // TODO: portID should generated based on range defined and it should re-use freed ports for that module
  private async applyControlPortCountChange(
    module: SpfModule,
    requested: number,
  ): Promise<void> {
    const uow = this.uow;
    const fileSystemId = uow.getWriteContext().session.fileSystemId;

    const links = await uow.getControlLinkRepository().getLinksByPortSystemIds(
      module.controlPorts.map(p => p.systemId),
      fileSystemId,
    );

    const definition = await uow
      .getModuleDefinitionRepository()
      .findBySystemId(module.definitionSystemId, fileSystemId);
    if (!definition) {
      throw new ResourceNotFoundException(
        `SpfModuleDefinition ${module.definitionSystemId} not found.`,
      );
    }

    const outcome = resolvePortCountChange(
      module.controlPorts,
      requested,
      definition.staticControlPorts.length,
      links,
      ISSUE_ENTITY_TYPE.ControlPort,
      module.systemId,
    );
    if (outcome.kind === RESULT_KIND.Fail) {
      throw new DomainRuleViolationException([...outcome.issues]);
    }

    const {toAdd, toRemove} = outcome.data;
    if (toAdd > 0) {
      // only dynamic (non-static) ports consume slots from the dynamic intent pool.
      // Static ports have their intents assigned from per-port definitions and must not affect CurrentUsage.
      const dynamicPorts = module.controlPorts.filter(cp => !cp.isStatic);

      // compute CurrentUsage per intent TYPE across all dynamic ports.
      // intentTypeIds carries the DynamicIntentDefinition.intentId values (type IDs),
      // which is what we compare against definition.dynamicIntents[n].intentId.
      const usageByIntentTypeId = new Map<number, number>();
      for (const cp of dynamicPorts) {
        for (const typeId of cp.intentTypeIds) {
          usageByIntentTypeId.set(
            typeId,
            (usageByIntentTypeId.get(typeId) ?? 0) + 1,
          );
        }
      }

      // available = intent types where CurrentUsage < MaxUsage (maxPort)
      const availableIntents = definition.dynamicIntents.filter(
        def => (usageByIntentTypeId.get(def.intentId) ?? 0) < def.maxPort,
      );

      // Total remaining capacity across all available intent types.
      // Each new port consumes one slot; we need at least toAdd slots available.
      const totalAvailableSlots = availableIntents.reduce(
        (sum, def) =>
          sum + def.maxPort - (usageByIntentTypeId.get(def.intentId) ?? 0),
        0,
      );

      // reject when exhausted (available list empty) or capacity is insufficient
      if (totalAvailableSlots < toAdd) {
        throw new DomainRuleViolationException([
          IssueFactory.noAvailableIntents(
            module.systemId,
            toAdd,
            totalAvailableSlots,
          ),
        ]);
      }

      const moduleRepo = uow.getModuleRepository();
      for (let i = 0; i < toAdd; i++) {
        const portDef =
          definition.staticControlPorts[module.controlPorts.length + i];
        await moduleRepo.addControlPort(
          new ControlPort({
            systemId: await this.idGeneration.getNextId(fileSystemId),
            portId: portDef?.portId ?? 0,
            isStatic: true,
            nodeSystemId: module.systemId,
            name: portDef?.portName,
            intentSystemIds: [],
          }),
          module.systemId,
        );
      }
    }
    const moduleRepo = uow.getModuleRepository();
    for (const portSystemId of toRemove) {
      await moduleRepo.removeControlPort(portSystemId, module.systemId);
    }
  }
}
