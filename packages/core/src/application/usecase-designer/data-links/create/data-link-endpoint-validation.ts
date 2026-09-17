/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {DATA_LINK_TYPE} from '../../../../domain/entities/usecase-data/links/data-link-type.js';
import type {DataLinkType} from '../../../../domain/entities/usecase-data/links/data-link-type.js';
import {PORT_IO_TYPE} from '../../../../domain/entities/common/enums/port-io-type.js';
import {
  DomainRuleViolationException,
  ResourceNotFoundException,
} from '../../../../shared/exceptions/index.js';
import {IssueSeverity} from '../../../../shared/issues/severity.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';

/**
 * Shared module-endpoint validation used by both POST /data-links and
 * POST /data-links/with-subsystems (module-to-module branch). Extracted to
 * avoid duplicating (and drifting) the same checks in both handlers.
 */

export async function findModules(
  moduleRepo: ReturnType<UnitOfWork['getModuleRepository']>,
  subsystemRepo: ReturnType<UnitOfWork['getSubsystemRepository']>,
  srcModuleId: number,
  dstModuleId: number,
  fileSystemId: number,
) {
  const [srcModule, dstModule] = await Promise.all([
    moduleRepo.findModulePortsForLink(srcModuleId, fileSystemId),
    moduleRepo.findModulePortsForLink(dstModuleId, fileSystemId),
  ]);
  if (srcModule === null) {
    const isSubsystem = await subsystemRepo.subsystemExists(
      srcModuleId,
      fileSystemId,
    );
    throw isSubsystem
      ? new DomainRuleViolationException([
          {
            code: 'WRONG_NODE_TYPE',
            message: `Source node ${BinaryUtils.toHexString(srcModuleId)} is a subsystem, not a module.`,
            severity: IssueSeverity.Error,
          },
        ])
      : new ResourceNotFoundException(
          `Source module ${BinaryUtils.toHexString(srcModuleId)} not found.`,
        );
  }
  if (dstModule === null) {
    const isSubsystem = await subsystemRepo.subsystemExists(
      dstModuleId,
      fileSystemId,
    );
    throw isSubsystem
      ? new DomainRuleViolationException([
          {
            code: 'WRONG_NODE_TYPE',
            message: `Destination node ${BinaryUtils.toHexString(dstModuleId)} is a subsystem, not a module.`,
            severity: IssueSeverity.Error,
          },
        ])
      : new ResourceNotFoundException(
          `Destination module ${BinaryUtils.toHexString(dstModuleId)} not found.`,
        );
  }
  return [srcModule, dstModule] as const;
}

export async function findPort(
  subsystemRepo: ReturnType<UnitOfWork['getSubsystemRepository']>,
  ports: {systemId: number; portIoType: string}[],
  portId: number,
  fileSystemId: number,
  side: 'Source' | 'Destination',
) {
  const port = ports.find(p => p.systemId === portId);
  if (port) return port;
  if (!(await subsystemRepo.portExists(portId, fileSystemId))) {
    throw new ResourceNotFoundException(
      `${side} port ${BinaryUtils.toHexString(portId)} not found.`,
    );
  }
  throw new DomainRuleViolationException([
    {
      code: 'PORT_OWNERSHIP_MISMATCH',
      message: `Port ${BinaryUtils.toHexString(portId)} does not belong to ${side.toLowerCase()} module — ownership check failed.`,
      severity: IssueSeverity.Error,
    },
  ]);
}

export function validatePortDirections(
  srcPort: {portIoType: string},
  srcPortId: number,
  dstPort: {portIoType: string},
  dstPortId: number,
): void {
  if (srcPort.portIoType !== PORT_IO_TYPE.Output) {
    throw new DomainRuleViolationException([
      {
        code: 'WRONG_PORT_DIRECTION',
        message: `Source port ${BinaryUtils.toHexString(srcPortId)} must be OUTPUT, got ${srcPort.portIoType}.`,
        severity: IssueSeverity.Error,
      },
    ]);
  }
  if (dstPort.portIoType !== PORT_IO_TYPE.Input) {
    throw new DomainRuleViolationException([
      {
        code: 'WRONG_PORT_DIRECTION',
        message: `Destination port ${BinaryUtils.toHexString(dstPortId)} must be INPUT, got ${dstPort.portIoType}.`,
        severity: IssueSeverity.Error,
      },
    ]);
  }
}

/**
 * FR-DL-09 / FR-DLS-10 classification validation, shared by both endpoints:
 * - EC is invalid only when source and destination share the same subgraph.
 * - NORMAL requires the same usecase.
 * - INTER_USECASE requires different usecases.
 */
export async function validateLinkType(
  uow: UnitOfWork,
  linkType: DataLinkType,
  srcSubgraphId: number,
  dstSubgraphId: number,
  fileSystemId: number,
): Promise<void> {
  const subgraphRepo = uow.getSubgraphRepository();
  if (linkType === DATA_LINK_TYPE.Ec) {
    if (srcSubgraphId === dstSubgraphId) {
      throw new DomainRuleViolationException([
        IssueFactory.linkClassificationInvalid(
          'EC_SAME_SUBGRAPH',
          'EC data links cannot remain in one subgraph.',
        ),
      ]);
    }
    return;
  }
  const [srcUsecaseId, dstUsecaseId] = await Promise.all([
    subgraphRepo.getUsecaseSystemIdForSubgraph(srcSubgraphId, fileSystemId),
    subgraphRepo.getUsecaseSystemIdForSubgraph(dstSubgraphId, fileSystemId),
  ]);
  const sameUsecase =
    srcUsecaseId !== null &&
    dstUsecaseId !== null &&
    srcUsecaseId === dstUsecaseId;
  if (linkType === DATA_LINK_TYPE.Normal && !sameUsecase) {
    throw new DomainRuleViolationException([
      IssueFactory.linkClassificationInvalid(
        'NORMAL_DIFFERENT_USECASE',
        'NORMAL data links require the same usecase.',
      ),
    ]);
  }
  if (linkType === DATA_LINK_TYPE.InterUsecase && sameUsecase) {
    throw new DomainRuleViolationException([
      IssueFactory.linkClassificationInvalid(
        'INTER_USE_CASE_SAME_USECASE',
        'linkType=INTER_USECASE but source and destination belong to the same usecase.',
      ),
    ]);
  }
}
