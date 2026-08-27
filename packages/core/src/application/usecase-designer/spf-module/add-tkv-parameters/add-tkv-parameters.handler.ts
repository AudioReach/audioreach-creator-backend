/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/index.js';
import {Result} from '../../../shared/result/result.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import {serializeDefaultParameterData} from '../../shared/serialize-elements.js';
import type {AddTkvParametersCommand} from './add-tkv-parameters.command.js';

export interface AddTkvParametersResult {
  groupId: string;
}

export class AddTkvParametersHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async handle(
    command: AddTkvParametersCommand,
  ): Promise<Result<AddTkvParametersResult>> {
    const {session, groupId} = this.uow.getWriteContext();
    const {fileSystemId} = session;
    const moduleRepo = this.uow.getModuleRepository();
    const defRepo = this.uow.getModuleDefinitionRepository();

    const spfModule = await moduleRepo.getSpfModuleForValidation(
      command.spfModuleSystemId,
      fileSystemId,
    );
    if (!spfModule) throw new ResourceNotFoundException('SpfModule not found');

    const issues = [];

    await this.uow.startTransaction();
    try {
      for (const {tkvSystemId, parameterSystemIds} of command.updates) {
        const issue = await this.addParametersToTkv(
          tkvSystemId,
          parameterSystemIds,
          spfModule.definitionSystemId,
          command.spfModuleSystemId,
          fileSystemId,
          moduleRepo,
          defRepo,
        );
        if (issue) issues.push(issue);
      }

      await this.uow.commit();
      const data: AddTkvParametersResult = {groupId};
      return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }

  private async addParametersToTkv(
    tkvSystemId: number,
    parameterSystemIds: number[],
    definitionSystemId: number,
    spfModuleSystemId: number,
    fileSystemId: number,
    moduleRepo: ReturnType<UnitOfWork['getModuleRepository']>,
    defRepo: ReturnType<UnitOfWork['getModuleDefinitionRepository']>,
  ) {
    const tkv = await moduleRepo.getTkvBySystemId(tkvSystemId, 0);
    if (!tkv) return IssueFactory.notFound(ISSUE_ENTITY_TYPE.Tkv, tkvSystemId);

    const allDefs = await defRepo.getParameterDefinitions(
      definitionSystemId,
      parameterSystemIds,
    );
    const defMap = new Map(allDefs.map(d => [d.systemId, d]));
    for (const parameterSystemId of parameterSystemIds) {
      const def = defMap.get(parameterSystemId);
      if (!def || def.isReadOnly) continue;
      const serialized = serializeDefaultParameterData(def);
      if (!serialized.ok) continue;
      const payloadSystemId = await this.idGeneration.getNextId(fileSystemId);
      await moduleRepo.addParameterToTkv(
        tkvSystemId,
        spfModuleSystemId,
        parameterSystemId,
        payloadSystemId,
        serialized.value,
      );
    }
    return null;
  }
}
