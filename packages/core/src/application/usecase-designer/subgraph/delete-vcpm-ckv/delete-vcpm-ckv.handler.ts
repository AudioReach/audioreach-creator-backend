/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {DeleteVcpmCkvCommand} from './delete-vcpm-ckv.command.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/index.js';

export class DeleteVcpmCkvHandler implements CommandHandler<
  DeleteVcpmCkvCommand,
  void
> {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(command: DeleteVcpmCkvCommand): Promise<void> {
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

    await repository.deleteVcpmCkv(
      command.subgraphSystemId,
      command.ckvSystemId,
    );
  }
}
