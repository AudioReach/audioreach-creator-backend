/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {VcpmPayloadCreate} from '../../../ports/persistence/repositories/subgraph/subgraph.repository.js';
import type {CreateVcpmCkvCommand} from './create-vcpm-ckv.command.js';
import type {CreateVcpmCkvDto} from '../dto/subgraph-write-result-types.js';
import {serializeDefaultParameterData} from '../../shared/serialize-elements.js';
import {
  ResourceNotFoundException,
  DomainRuleViolationException,
} from '../../../../shared/exceptions/index.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {RESULT_KIND} from '../../../shared/result/result.js';

export class CreateVcpmCkvHandler implements CommandHandler<
  CreateVcpmCkvCommand,
  CreateVcpmCkvDto
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
    private readonly queryServices: QueryServices,
  ) {}

  async handle(command: CreateVcpmCkvCommand): Promise<CreateVcpmCkvDto> {
    const {session, groupId} = this.uow.getWriteContext();
    const fileSystemId = session.fileSystemId;
    const repository = this.uow.getSubgraphRepository();

    if (
      !(await repository.subgraphExists(command.subgraphSystemId, fileSystemId))
    ) {
      throw new ResourceNotFoundException(
        `Subgraph ${command.subgraphSystemId} not found`,
      );
    }

    const definitions =
      await this.queryServices.vcpmDefinitionQueryService.getVcpmModuleDefinitionsWithParams(
        fileSystemId,
      );
    const definition = definitions[0];
    if (!definition) {
      throw new ResourceNotFoundException(
        `No VCPM module definition found for file ${fileSystemId}`,
      );
    }

    const writeAggregate = await repository.getVcpmWriteAggregate(
      command.subgraphSystemId,
    );
    const instanceSystemId = writeAggregate.instanceSystemId;
    if (instanceSystemId === null) {
      throw new ResourceNotFoundException(
        `VCPM instance not found for subgraph ${command.subgraphSystemId}`,
      );
    }

    const valueSystemIds = command.ckv.flatMap(pair =>
      pair.valueSystemIds.map(Number),
    );
    const requestedValues = [...valueSystemIds].sort((a, b) => a - b);
    const duplicate = writeAggregate.ckvs.some(ckv => {
      if (ckv.vcpmInstanceSystemId !== instanceSystemId) return false;
      const existingValues = [...ckv.valueDefSystemIds].sort(
        (a, b) => a - b,
      );
      return (
        existingValues.length === requestedValues.length &&
        existingValues.every((value, index) => value === requestedValues[index])
      );
    });
    if (duplicate) {
      throw new DomainRuleViolationException([
        IssueFactory.parseError(
          'VCPM_CKV_DUPLICATE',
          `A VCPM CKV with the requested values already exists for instance ${instanceSystemId}`,
        ),
      ]);
    }

    const serializedPayloads = [];
    for (const param of definition.parameters) {
      const serialized = serializeDefaultParameterData(param);
      if (!serialized.ok) {
        throw new Error(
          `Failed to serialize default payload for VcpmParameterDefinition ${param.systemId}: ${serialized.error}`,
        );
      }
      serializedPayloads.push({param, payload: serialized.value});
    }

    await this.uow.startTransaction();
    let ckvSystemId: number;
    try {
      ckvSystemId = await this.idGeneration.getNextId(fileSystemId);
      const payloads: VcpmPayloadCreate[] = [];
      for (const {param, payload} of serializedPayloads) {
        payloads.push({
          systemId: await this.idGeneration.getNextId(fileSystemId),
          vcpmParameterSystemId: param.systemId,
          payload,
        });
      }

      await repository.createVcpmCkv(
        command.subgraphSystemId,
        ckvSystemId,
        instanceSystemId,
        valueSystemIds,
        payloads,
      );
      await this.uow.commit();
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }

    const keyValueResult =
      await this.queryServices.keyValueDefQueryService.getKeyValueSummaryForGivenValues(
        valueSystemIds,
        fileSystemId,
      );
    const ckv =
      keyValueResult.kind === RESULT_KIND.Fail
        ? []
        : keyValueResult.data.map(pair => ({
            keyId: pair.key.keyId,
            valueId: pair.value.valueId,
          }));

    return {groupId, ckvSystemId: String(ckvSystemId), ckv};
  }
}
