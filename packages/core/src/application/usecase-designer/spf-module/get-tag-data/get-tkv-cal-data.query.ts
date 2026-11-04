/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {BaseQuery} from '../../../shared/base-query.js';
import {parseId} from '../../shared/parse-id.js';

/**
 * Query to retrieve tag data for a specific TKV (Tag Key-Value) bin
 * belonging to an SPF module, scoped to a moduleTagIdMap entry (tagSystemId).
 *
 * All ID parameters are accepted as raw strings (as received from the HTTP layer)
 * and parsed to integers in the constructor. Decimal and hexadecimal (0x prefix)
 * notation are both supported. Throws `InvalidOperationException` if any value
 * cannot be parsed — the global exception filter maps this to HTTP 400.
 */
export class GetTkvCalibrationDataQuery extends BaseQuery {
  public readonly projectId: number;
  public readonly spfModuleSystemId: number;
  /** moduleTagIdMapSystemId — PK of the module_tag_id_map row that owns this TKV. */
  public readonly tagSystemId: number;
  public readonly tkvSystemId: number;
  /** Parameter-definition system IDs to return. Empty = all payloads. */
  public readonly paramSystemIds: number[];

  constructor(
    projectIdStr: string,
    spfModuleSystemIdStr: string,
    tagSystemIdStr: string,
    tkvSystemIdStr: string,
    clientId: string,
    paramSystemIdsStr?: string,
  ) {
    super(clientId);
    this.projectId = parseId(projectIdStr, 'projectId');
    this.spfModuleSystemId = parseId(spfModuleSystemIdStr, 'spfModuleSystemId');
    this.tagSystemId = parseId(tagSystemIdStr, 'tagSystemId');
    this.tkvSystemId = parseId(tkvSystemIdStr, 'tkvSystemId');
    this.paramSystemIds = paramSystemIdsStr
      ? paramSystemIdsStr
          .split(',')
          .map(id => parseId(id.trim(), 'param-system-ids'))
      : [];
  }
}
