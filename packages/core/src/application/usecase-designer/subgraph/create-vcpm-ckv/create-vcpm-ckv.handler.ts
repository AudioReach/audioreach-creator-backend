/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {CreateVcpmCkvPayload} from '../../../ports/persistence/repositories/subgraph/subgraph.repository.js';
import type {CreateVcpmCkvCommand} from './create-vcpm-ckv.command.js';
import type {CreateVcpmCkvDto} from '../dto/subgraph-write-result-types.js';
import {serializeDefaultParameterData} from '../../shared/serialize-elements.js';
import {
  ResourceNotFoundException,
  DomainRuleViolationException,
} from '../../../../shared/exceptions/index.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';

export class CreateVcpmCkvHandler implements CommandHandler<
  CreateVcpmCkvCommand,
  CreateVcpmCkvDto
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
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

    const writeState = await repository.getAllVcpmData(
      command.subgraphSystemId,
    );
    if (writeState === null) {
      throw new ResourceNotFoundException(
        `VCPM instance not found for subgraph ${command.subgraphSystemId}`,
      );
    }
    const vcpmInstanceSystemId = writeState.instance.systemId;

    const definitions = await this.uow
      .getVcpmDefinitionRepository()
      .getAllVcpmModuleDefinitions(fileSystemId);
    const definition = definitions.find(
      candidate =>
        candidate.systemId === writeState.instance.vcpmModuleDefinitionSystemId,
    );
    if (!definition) {
      throw new ResourceNotFoundException(
        `No VCPM module definition ${writeState.instance.vcpmModuleDefinitionSystemId} found for file ${fileSystemId}`,
      );
    }

    const valueSystemIds = command.ckv.flatMap(pair =>
      pair.valueSystemIds.map(Number),
    );
    const requestedValues = [...valueSystemIds].sort((a, b) => a - b);
    const duplicate = writeState.instance.ckvs.some(ckv => {
      const existingValues = [...ckv.valueDefinitionSystemIds].sort(
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
          `A VCPM CKV with the requested values already exists for instance ${vcpmInstanceSystemId}`,
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
    let newCkvSystemId: number;
    try {
      newCkvSystemId = await this.idGeneration.getNextId(fileSystemId);
      const payloads: CreateVcpmCkvPayload[] = [];
      for (const {param, payload} of serializedPayloads) {
        payloads.push({
          payloadSystemId: await this.idGeneration.getNextId(fileSystemId),
          parameterDefinitionSystemId: param.systemId,
          payload,
        });
      }

      await repository.createVcpmCkv(
        command.subgraphSystemId,
        newCkvSystemId,
        vcpmInstanceSystemId,
        valueSystemIds,
        payloads,
      );
      await this.uow.commit();
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }

    const summaries = await this.uow
      .getKeyValueDefinitionRepository()
      .getSummariesForValues(fileSystemId, session.sessionId, valueSystemIds);
    const ckv = summaries.map(summary => ({
      keyNaturalId: summary.keyId,
      valueNaturalId: summary.valueId,
    }));

    return {groupId, ckvSystemId: String(newCkvSystemId), ckv};
  }
}
