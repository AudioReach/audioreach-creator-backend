/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BadRequestException} from '@nestjs/common';
import type {SubgraphPeerLinkFilter} from '@arc/core';

interface SubgraphPeerLinkFilterValues {
  subgraphSystemId?: string;
  moduleSystemId?: string;
  portSystemId?: string;
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
