/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {UpdateVcpmCalDataCommand} from './update-vcpm-cal-data.command.js';
import type {PutVcpmCalDataResult} from './put-vcpm-cal-data-result.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/index.js';
import {Result} from '../../../shared/result/result.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import type {Issue} from '../../../../shared/issues/issue.js';
import {serializeParameterData} from '../../shared/serialize-elements.js';
import {mapDtoToParameterCalibration} from '../../spf-module/get-cal-data/ckv-cal-data-dto.js';
import type {ParameterDefinitionBase} from '../../../ports/persistence/repositories/module/module-definition.repository.js';
import type {ParameterElementDto} from '../../spf-module/dto/element-dto.js';

type VcpmPayloadUpdate = {payloadSystemId: number; payload: Uint8Array};

type ParameterUpdateResult =
  | {kind: 'issue'; issue: Issue}
  | {
      kind: 'success';
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
    if (
      !(await repository.vcpmCkvExistsBySystemId(
        command.ckvSystemId,
        command.subgraphSystemId,
      ))
    ) {
      throw new ResourceNotFoundException(
        `VcpmCkv ${command.ckvSystemId} not found`,
      );
    }

    const payloads = await repository.getVcpmCkvPayloads(
      command.ckvSystemId,
      command.subgraphSystemId,
    );
    const definitions =
      await this.queryServices.vcpmDefinitionQueryService.getVcpmModuleDefinitionsWithParams(
        session.fileSystemId,
      );
    const definitionsBySystemId = this.indexParameterDefinitions(definitions);

    const payloadBySystemId = new Map(
      payloads.map(payload => [payload.systemId, payload]),
    );
    const {succeededParamSystemIds, issues, updates} =
      this.buildParameterUpdates(
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

    const data = {groupId, succeededParamSystemIds};
    return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
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
    issues: Issue[];
    updates: VcpmPayloadUpdate[];
  } {
    const succeededParamSystemIds: number[] = [];
    const issues: Issue[] = [];
    const updates: VcpmPayloadUpdate[] = [];

    for (const parameter of parameters) {
      const result = this.buildParameterUpdate(
        parameter,
        payloadBySystemId,
        definitionsBySystemId,
      );
      if (result.kind === 'issue') {
        issues.push(result.issue);
        continue;
      }
      succeededParamSystemIds.push(result.parameterSystemId);
      updates.push(result.update);
    }

    return {succeededParamSystemIds, issues, updates};
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
      return {
        kind: 'issue',
        issue: IssueFactory.paramPayloadNotFound(parameter.systemId),
      };
    }

    const definition = definitionsBySystemId.get(payload.vcpmParameterSystemId);
    if (!definition) {
      throw new Error(
        `ParameterDefinition missing for parameterSystemId=${payload.vcpmParameterSystemId} — DB integrity violation`,
      );
    }
    if (definition.isReadOnly) {
      return {
        kind: 'issue',
        issue: IssueFactory.paramReadOnly(parameter.systemId),
      };
    }

    const serialized = serializeParameterData(
      definition,
      mapDtoToParameterCalibration(
        parameter.elements as unknown as ParameterElementDto[],
      ),
    );
    if (!serialized.ok) {
      return {
        kind: 'issue',
        issue: IssueFactory.paramSerializationFailed(
          parameter.systemId,
          serialized.error,
        ),
      };
    }

    return {
      kind: 'success',
      parameterSystemId: parameter.systemId,
      update: {payloadSystemId: parameter.systemId, payload: serialized.value},
    };
  }
}
