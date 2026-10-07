/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {UpdateVcpmCalDataCommand} from './update-vcpm-cal-data.command.js';
import {
  ResourceNotFoundException,
  InvalidOperationException,
} from '../../../../shared/exceptions/index.js';
import {serializeParameterData} from '../../shared/serialize-elements.js';
import {mapDtoToParameterCalibration} from '../../spf-module/get-cal-data/ckv-cal-data-dto.js';
import type {ModuleParameterDefinition} from '../../../ports/persistence/repositories/module/module-definition.repository.js';
import type {VcpmModuleDefinition} from '../../../../domain/entities/definitions/vcpm-module/vcpm-module-definition.js';
import type {ParameterElementDto} from '../../spf-module/dto/element-dto.js';
import type {UpdateVcpmCalDataPayload} from '../../../ports/persistence/repositories/subgraph/subgraph.repository.js';

export class UpdateVcpmCalDataHandler implements CommandHandler<
  UpdateVcpmCalDataCommand,
  void
> {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(command: UpdateVcpmCalDataCommand): Promise<void> {
    const {session} = this.uow.getWriteContext();
    const repository = this.uow.getSubgraphRepository();

    if (
      !(await repository.subgraphExists(
        command.subgraphSystemId,
        session.fileSystemId,
      ))
    ) {
      throw new ResourceNotFoundException(
        `Subgraph ${command.subgraphSystemId} not found`,
      );
    }
    const writeState = await repository.getAllVcpmData(
      command.subgraphSystemId,
      command.ckvSystemId,
    );
    if (writeState === null) {
      throw new ResourceNotFoundException(
        `VCPM instance not found for subgraph ${command.subgraphSystemId}`,
      );
    }
    if (writeState.instance.ckvs.length === 0) {
      throw new ResourceNotFoundException(
        `VcpmCkv ${command.ckvSystemId} not found`,
      );
    }

    const definitions = await this.uow
      .getVcpmDefinitionRepository()
      .getAllVcpmModuleDefinitions(session.fileSystemId);
    const definition = definitions.find(
      candidate =>
        candidate.systemId === writeState.instance.vcpmModuleDefinitionSystemId,
    );
    if (!definition) {
      throw new ResourceNotFoundException(
        `No VCPM module definition ${writeState.instance.vcpmModuleDefinitionSystemId} found for file ${session.fileSystemId}`,
      );
    }
    const payloads = writeState.payloads;
    const definitionsBySystemId = this.indexParameterDefinitions(definition);

    const updates = this.buildParameterUpdates(
      command.ckvSystemId,
      command.parameters,
      payloads,
      definitionsBySystemId,
    );

    await this.uow.startTransaction();
    try {
      await repository.updateVcpmCalData(command.subgraphSystemId, updates);
      await this.uow.commit();
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }

  private indexParameterDefinitions(
    definition: VcpmModuleDefinition,
  ): Map<number, ModuleParameterDefinition> {
    const definitionsBySystemId = new Map<number, ModuleParameterDefinition>();
    for (const parameter of definition.parameters) {
      definitionsBySystemId.set(parameter.systemId, parameter);
    }
    return definitionsBySystemId;
  }

  private buildParameterUpdates(
    ckvSystemId: number,
    parameters: UpdateVcpmCalDataCommand['parameters'],
    payloadBySystemId: Map<number, number>,
    definitionsBySystemId: Map<number, ModuleParameterDefinition>,
  ): UpdateVcpmCalDataPayload[] {
    const updates: UpdateVcpmCalDataPayload[] = [];

    for (const parameter of parameters) {
      updates.push(
        this.buildParameterUpdate(
          ckvSystemId,
          parameter,
          payloadBySystemId,
          definitionsBySystemId,
        ),
      );
    }

    return updates;
  }

  private buildParameterUpdate(
    ckvSystemId: number,
    parameter: UpdateVcpmCalDataCommand['parameters'][number],
    payloadBySystemId: Map<number, number>,
    definitionsBySystemId: Map<number, ModuleParameterDefinition>,
  ): UpdateVcpmCalDataPayload {
    const parameterDefinitionSystemId = payloadBySystemId.get(
      parameter.systemId,
    );
    if (parameterDefinitionSystemId === undefined) {
      throw new ResourceNotFoundException(
        `Parameter payload not found: systemId=${parameter.systemId}`,
      );
    }

    const definition = definitionsBySystemId.get(parameterDefinitionSystemId);
    if (!definition) {
      throw new Error(
        `ParameterDefinition missing for parameterSystemId=${parameterDefinitionSystemId} — DB integrity violation`,
      );
    }
    if (definition.isReadOnly) {
      throw new InvalidOperationException(
        `Parameter ${parameter.systemId} is read-only`,
      );
    }

    const serialized = serializeParameterData(
      definition,
      mapDtoToParameterCalibration(
        parameter.elements as unknown as ParameterElementDto[],
      ),
    );
    if (!serialized.ok) {
      throw new InvalidOperationException(
        `Parameter ${parameter.systemId} serialization failed: ${serialized.error}`,
      );
    }

    return {
      payloadSystemId: parameter.systemId,
      vcpmCkvSystemId: ckvSystemId,
      parameterDefinitionSystemId,
      payload: serialized.value,
    };
  }
}
