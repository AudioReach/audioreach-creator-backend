/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  type UnitOfWork,
  type IdGenerationPort,
  type SpfModule,
  type PortIoType,
  ISSUE_ENTITY_TYPE,
  ResourceNotFoundException,
  InvalidOperationException,
  DomainRuleViolationException,
  PORT_IO_TYPE,
  MODULE_PORT_STRATEGIES,
  type ModulePortStrategy,
} from '@arc/core';
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {CONTAINER_PROP_ID_STACK_SIZE} from '../../../file-operations/shared/constants/spf-ids.js';
import {buildContainerCopy} from '../../container/build-container-copy.js';
import {DataPort} from '../../../../domain/entities/usecase-data/node/entities/data-port.js';
import {ControlPort} from '../../../../domain/entities/usecase-data/node/entities/control-port.js';
import {resolvePortCountChange} from './resolve-port-count-change.js';
import {RESULT_KIND} from '../../../shared/result/result.js';
import {
  nextDataPortIds,
  nextControlPortIds,
} from '../../../../domain/services/port-id-calculator/port-id-calculator.js';
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

      // Load port strategy once — only when a data port count field is present.
      // Default to INPUT_EVEN_OUTPUT_ODD when no configuration row exists so
      // the absence of configuration is explicit at the domain boundary.
      const needsPortStrategy =
        command.maxInputPortsSupported !== undefined ||
        command.maxOutputPortsSupported !== undefined;
      const portStrategy: ModulePortStrategy = needsPortStrategy
        ? ((await this.uow
            .getProjectRepository()
            .getPortStrategy(fileSystemId)) ??
          MODULE_PORT_STRATEGIES.INPUT_EVEN_OUTPUT_ODD)
        : MODULE_PORT_STRATEGIES.INPUT_EVEN_OUTPUT_ODD;

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
          portStrategy,
        );
      }
      if (command.maxOutputPortsSupported !== undefined) {
        await this.applyDataPortCountChange(
          module,
          PORT_IO_TYPE.Output,
          command.maxOutputPortsSupported,
          portStrategy,
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

    // TODO(stack-size): Recalculate the new container's stack size after the module move.
    // Use the property API once the module's stack size contribution is available:
    //
    //   const currentData = await containerRepo.getPropertyData(
    //     newContainerId, CONTAINER_PROP_ID_STACK_SIZE, fileSystemId,
    //   );
    //   const currentStackSize = currentData ? decodeStackSize(currentData) : 0;
    //   const newStackSize = computeNewStackSize(currentStackSize, module, ...);
    //   await containerRepo.setPropertyData(
    //     newContainerId, CONTAINER_PROP_ID_STACK_SIZE, encodeStackSize(newStackSize),
    //   );
  }

  private async applyDataPortCountChange(
    module: SpfModule,
    ioType: Extract<
      PortIoType,
      typeof PORT_IO_TYPE.Input | typeof PORT_IO_TYPE.Output
    >,
    requested: number,
    strategy: ModulePortStrategy,
  ): Promise<void> {
    const uow = this.uow;
    const fileSystemId = uow.getWriteContext().session.fileSystemId;

    const currentPorts = module.dataPorts.filter(p => p.portIoType === ioType);
    const staticPorts = currentPorts.filter(p => p.isStatic);
    const dynamicPorts = currentPorts.filter(p => !p.isStatic);

    if (requested < staticPorts.length) {
      throw new DomainRuleViolationException([
        IssueFactory.portCountBelowStaticMinimum(
          module.systemId,
          requested,
          staticPorts.length,
          ISSUE_ENTITY_TYPE.DataPort,
        ),
      ]);
    }

    const dynamicRequested = requested - staticPorts.length;

    const links = await uow.getDataLinkRepository().getLinksByPortSystemIds(
      dynamicPorts.map(p => p.systemId),
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
    const maxDynamic =
      (portGroup?.maxAllowedPortCount ?? 0) - staticPorts.length;
    const outcome = resolvePortCountChange(
      dynamicPorts,
      dynamicRequested,
      maxDynamic,
      links,
      ISSUE_ENTITY_TYPE.DataPort,
      module.systemId,
    );
    if (outcome.kind === RESULT_KIND.Fail) {
      throw new DomainRuleViolationException([...outcome.issues]);
    }

    const {toAdd, toRemove} = outcome.data;
    const moduleRepo = uow.getModuleRepository();
    const isInput = ioType === PORT_IO_TYPE.Input;
    // existingIds includes ALL ports (static + dynamic) to prevent ID collision with static ports
    const existingIds = new Set(currentPorts.map(p => p.dataPortId));
    const newPortIds = nextDataPortIds(existingIds, isInput, strategy, toAdd);
    for (const dataPortId of newPortIds) {
      await moduleRepo.addDataPort(
        new DataPort({
          systemId: await this.idGeneration.getNextId(fileSystemId),
          dataPortId,
          portIoType: ioType,
          isStatic: false,
          name: `${isInput ? 'Input' : 'Output'}_${dataPortId}`,
        }),
        module.systemId,
      );
    }
    for (const portSystemId of toRemove) {
      await moduleRepo.removeDataPort(portSystemId, module.systemId);
    }
  }

  private async applyControlPortCountChange(
    module: SpfModule,
    requested: number,
  ): Promise<void> {
    const uow = this.uow;
    const fileSystemId = uow.getWriteContext().session.fileSystemId;

    const staticControlPorts = module.controlPorts.filter(cp => cp.isStatic);
    const dynamicControlPorts = module.controlPorts.filter(cp => !cp.isStatic);

    if (requested < staticControlPorts.length) {
      throw new DomainRuleViolationException([
        IssueFactory.portCountBelowStaticMinimum(
          module.systemId,
          requested,
          staticControlPorts.length,
          ISSUE_ENTITY_TYPE.ControlPort,
        ),
      ]);
    }

    const dynamicRequested = requested - staticControlPorts.length;

    const links = await uow.getControlLinkRepository().getLinksByPortSystemIds(
      dynamicControlPorts.map(p => p.systemId),
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

    // Total dynamic capacity = sum of maxPort across all dynamic intent types.
    // The intent-availability check below enforces the fine-grained per-type limit.
    const maxDynamicIntentCapacity = definition.dynamicIntents.reduce(
      (sum, d) => sum + d.maxPort,
      0,
    );

    const outcome = resolvePortCountChange(
      dynamicControlPorts,
      dynamicRequested,
      maxDynamicIntentCapacity,
      links,
      ISSUE_ENTITY_TYPE.ControlPort,
      module.systemId,
    );
    if (outcome.kind === RESULT_KIND.Fail) {
      throw new DomainRuleViolationException([...outcome.issues]);
    }

    const {toAdd, toRemove} = outcome.data;
    if (toAdd > 0) {
      // Only dynamic ports consume slots from the dynamic intent pool.
      // Static ports have their intents assigned from per-port definitions.
      const usageByIntentTypeId = new Map<number, number>();
      for (const cp of dynamicControlPorts) {
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
      const existingControlIds = new Set(
        module.controlPorts.map(p => p.portId),
      );
      const newControlPortIds = nextControlPortIds(existingControlIds, toAdd);
      for (const portId of newControlPortIds) {
        await moduleRepo.addControlPort(
          new ControlPort({
            systemId: await this.idGeneration.getNextId(fileSystemId),
            portId,
            isStatic: false,
            nodeSystemId: module.systemId,
            name: `ControlPort_0x${portId.toString(16)}`,
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
