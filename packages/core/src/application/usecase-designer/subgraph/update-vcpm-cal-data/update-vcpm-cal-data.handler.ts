/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {UpdateVcpmCalDataCommand} from './update-vcpm-cal-data.command.js';
import type {PutVcpmCalDataResult} from './put-vcpm-cal-data-result.js';
import {
  ResourceNotFoundException,
  InvalidOperationException,
} from '../../../../shared/exceptions/index.js';
import {Result} from '../../../shared/result/result.js';
import {serializeParameterData} from '../../shared/serialize-elements.js';
import {mapDtoToParameterCalibration} from '../../spf-module/get-cal-data/ckv-cal-data-dto.js';
import type {ParameterDefinitionBase} from '../../../ports/persistence/repositories/module/module-definition.repository.js';
import type {ParameterElementDto} from '../../spf-module/dto/element-dto.js';

type VcpmPayloadUpdate = {payloadSystemId: number; payload: Uint8Array};

type ParameterUpdateResult = {
  parameterSystemId: number;
  update: VcpmPayloadUpdate;
};

export class UpdateVcpmCalDataHandler implements CommandHandler<
  UpdateVcpmCalDataCommand,
  Result<PutVcpmCalDataResult>
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly queryServices: QueryServices,
  ) {}

  async handle(
    command: UpdateVcpmCalDataCommand,
  ): Promise<Result<PutVcpmCalDataResult>> {
    const {session, groupId} = this.uow.getWriteContext();
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
    const writeAggregate = await repository.getVcpmWriteAggregate(
      command.subgraphSystemId,
      command.ckvSystemId,
    );
    if (writeAggregate.ckvs.length === 0) {
      throw new ResourceNotFoundException(
        `VcpmCkv ${command.ckvSystemId} not found`,
      );
    }

    const payloads = writeAggregate.payloads;
    const definitions =
      await this.queryServices.vcpmDefinitionQueryService.getVcpmModuleDefinitionsWithParams(
        session.fileSystemId,
      );
    const definitionsBySystemId = this.indexParameterDefinitions(definitions);

    const payloadBySystemId = new Map(
      payloads.map(payload => [payload.systemId, payload]),
    );
    const {succeededParamSystemIds, updates} = this.buildParameterUpdates(
      command.parameters,
      payloadBySystemId,
      definitionsBySystemId,
    );

    await this.uow.startTransaction();
    try {
      await repository.updateVcpmCalData(
        command.subgraphSystemId,
        command.ckvSystemId,
        updates,
      );
      await this.uow.commit();
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }

    return Result.ok({groupId, succeededParamSystemIds});
  }

  private indexParameterDefinitions(
    definitions: Array<{parameters: ParameterDefinitionBase[]}>,
  ): Map<number, ParameterDefinitionBase> {
    const definitionsBySystemId = new Map<number, ParameterDefinitionBase>();
    for (const definition of definitions) {
      for (const parameter of definition.parameters) {
        definitionsBySystemId.set(parameter.systemId, parameter);
      }
    }
    return definitionsBySystemId;
  }

  private buildParameterUpdates(
    parameters: UpdateVcpmCalDataCommand['parameters'],
    payloadBySystemId: Map<
      number,
      {systemId: number; vcpmParameterSystemId: number}
    >,
    definitionsBySystemId: Map<number, ParameterDefinitionBase>,
  ): {
    succeededParamSystemIds: number[];
    updates: VcpmPayloadUpdate[];
  } {
    const succeededParamSystemIds: number[] = [];
    const updates: VcpmPayloadUpdate[] = [];

    for (const parameter of parameters) {
      const result = this.buildParameterUpdate(
        parameter,
        payloadBySystemId,
        definitionsBySystemId,
      );
      succeededParamSystemIds.push(result.parameterSystemId);
      updates.push(result.update);
    }

    return {succeededParamSystemIds, updates};
  }

  private buildParameterUpdate(
    parameter: UpdateVcpmCalDataCommand['parameters'][number],
    payloadBySystemId: Map<
      number,
      {systemId: number; vcpmParameterSystemId: number}
    >,
    definitionsBySystemId: Map<number, ParameterDefinitionBase>,
  ): ParameterUpdateResult {
    const payload = payloadBySystemId.get(parameter.systemId);
    if (!payload) {
      throw new ResourceNotFoundException(
        `Parameter payload not found: systemId=${parameter.systemId}`,
      );
    }

    const definition = definitionsBySystemId.get(payload.vcpmParameterSystemId);
    if (!definition) {
      throw new Error(
        `ParameterDefinition missing for parameterSystemId=${payload.vcpmParameterSystemId} — DB integrity violation`,
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
      parameterSystemId: parameter.systemId,
      update: {payloadSystemId: parameter.systemId, payload: serialized.value},
    };
  }
}
