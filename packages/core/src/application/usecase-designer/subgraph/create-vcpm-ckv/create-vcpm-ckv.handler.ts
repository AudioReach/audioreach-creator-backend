/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {CreateVcpmCkvCommand} from './create-vcpm-ckv.command.js';
import type {CreateVcpmCkvDto} from '../dto/subgraph-write-result-types.js';
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

    const instanceSystemId = await repository.getVcpmInstanceSystemId(
      command.subgraphSystemId,
      definition.systemId,
    );
    if (instanceSystemId === null) {
      throw new ResourceNotFoundException(
        `VCPM instance not found for subgraph ${command.subgraphSystemId}`,
      );
    }

    const valueSystemIds = command.ckv.flatMap(pair =>
      pair.valueSystemIds.map(Number),
    );
    if (await repository.vcpmCkvExists(instanceSystemId, valueSystemIds)) {
      throw new DomainRuleViolationException([
        IssueFactory.parseError(
          'VCPM_CKV_DUPLICATE',
          `A VCPM CKV with the requested values already exists for instance ${instanceSystemId}`,
        ),
      ]);
    }

    await this.uow.startTransaction();
    let ckvSystemId: number;
    try {
      ckvSystemId = await repository.createVcpmCkv(
        command.subgraphSystemId,
        instanceSystemId,
        valueSystemIds,
        definition.parameters,
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
