/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BadRequestException} from '@nestjs/common';
import type {
  ModulePortLinkFilter,
  SubgraphLinkFilter,
  SubgraphPeerLinkFilter,
} from '@arc/core';

interface SubgraphPeerLinkFilterValues {
  subgraphSystemId?: string;
  subgraphPeerSystemId?: string;
  moduleSystemId?: string;
  portSystemId?: string;
}

export function parseModulePortLinkFilter(
  values: Pick<
    SubgraphPeerLinkFilterValues,
    'moduleSystemId' | 'portSystemId' | 'subgraphSystemId'
  >,
): ModulePortLinkFilter {
  if (values.subgraphSystemId !== undefined) {
    throw new BadRequestException(
      'subgraphSystemId is not supported for this endpoint',
    );
  }

  return {
    moduleSystemId: parseRequiredSystemId(
      values.moduleSystemId,
      'moduleSystemId',
    ),
    portSystemId: parseRequiredSystemId(values.portSystemId, 'portSystemId'),
  };
}

export function parseSubgraphLinkFilter(
  values: Pick<
    SubgraphPeerLinkFilterValues,
    'subgraphSystemId' | 'subgraphPeerSystemId'
  >,
): SubgraphLinkFilter {
  return {
    subgraphSystemId: parseRequiredSystemId(
      values.subgraphSystemId,
      'subgraphSystemId',
    ),
    subgraphPeerSystemId: parseSystemId(
      values.subgraphPeerSystemId,
      'subgraphPeerSystemId',
    ),
  };
}

export function parseSubgraphPeerLinkFilter(
  values: SubgraphPeerLinkFilterValues,
): SubgraphPeerLinkFilter {
  const subgraphSystemId = parseSystemId(
    values.subgraphSystemId,
    'subgraphSystemId',
  );
  const moduleSystemId = parseSystemId(values.moduleSystemId, 'moduleSystemId');
  const portSystemId = parseSystemId(values.portSystemId, 'portSystemId');

  if ((moduleSystemId === undefined) !== (portSystemId === undefined)) {
    throw new BadRequestException(
      'moduleSystemId and portSystemId must be supplied together',
    );
  }

  if (
    subgraphSystemId === undefined &&
    moduleSystemId === undefined &&
    portSystemId === undefined
  ) {
    throw new BadRequestException(
      'At least subgraphSystemId or both moduleSystemId and portSystemId are required',
    );
  }

  return {subgraphSystemId, moduleSystemId, portSystemId};
}

function parseRequiredSystemId(
  value: string | undefined,
  name: string,
): number {
  const parsed = parseSystemId(value, name);
  if (parsed === undefined) {
    throw new BadRequestException(`${name} is required`);
  }
  return parsed;
}

function parseSystemId(
  value: string | undefined,
  name: string,
): number | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || !/^\d+$/.test(trimmed)) {
    throw new BadRequestException(`${name} must be a valid numeric system ID`);
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed)) {
    throw new BadRequestException(`${name} must be a valid numeric system ID`);
  }
  return parsed;
}
