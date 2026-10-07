/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {ValidateFileQueryHandler} from '../../../../src/application/validation/queries/validate-file.handler.js';
import {
  ValidateFileQuery,
  type ValidateFileResult,
} from '../../../../src/application/validation/queries/validate-file.query.js';
import type {QueryServices} from '../../../../src/application/ports/persistence/query-services/query-services.js';
import {
  RESULT_KIND,
  type Result,
} from '../../../../src/application/shared/result/result.js';
import {SpfModule} from '../../../../src/domain/entities/usecase-data/module/spf-module.js';
import {KvData} from '../../../../src/domain/entities/common/entities/kv-data.js';
import {VALIDATION_RULE_GROUP} from '../../../../src/domain/validation/validation-rule.js';
import {EMPTY_PREFERENCES} from '../../../../src/domain/validation/validation-preferences.js';
import {ResourceNotFoundException} from '../../../../src/shared/exceptions/resource-not-found.exception.js';

const FILE_SYSTEM_ID = 5;

function makeMixedCkvModule(): SpfModule {
  const module = new SpfModule({
    systemId: 50,
    naturalId: 1,
    alias: 'mod-a',
    definitionSystemId: 200,
    containerSystemId: 300,
    subgraphSystemId: 400,
    fileSystemId: FILE_SYSTEM_ID,
    dataPorts: [],
    controlPorts: [],
  });
  module.addModuleCkv(
    new KvData({
      systemId: 10,
      valueDefinitionSystemIds: [],
      uiPersistence: null,
    }),
  );
  module.addModuleCkv(
    new KvData({
      systemId: 11,
      valueDefinitionSystemIds: [1001],
      uiPersistence: null,
    }),
  );
  return module;
}

function makeServices(
  options: {
    getFileId?: ReturnType<typeof jest.fn>;
    modules?: SpfModule[];
  } = {},
) {
  const {
    getFileId = jest.fn().mockResolvedValue(FILE_SYSTEM_ID),
    modules = [makeMixedCkvModule()],
  } = options;
  const services = {
    projectQueryService: {getFileIdByProjectId: getFileId},
    validationQueryService: {
      findModulesByFile: jest.fn().mockResolvedValue(modules),
      findUsecasesByFile: jest.fn().mockResolvedValue([]),
      findSubgraphsByFile: jest.fn().mockResolvedValue([]),
      findDataLinksByFile: jest.fn().mockResolvedValue([]),
      findControlLinksByFile: jest.fn().mockResolvedValue([]),
      findDefinitionsByFile: jest.fn().mockResolvedValue([]),
      getPreferences: jest.fn().mockResolvedValue(EMPTY_PREFERENCES),
      findStoredDataLossIssues: jest.fn().mockResolvedValue([]),
    },
  } as unknown as QueryServices;
  return {services, getFileId};
}

function dataOf(result: Result<ValidateFileResult>): ValidateFileResult {
  if (result.kind === RESULT_KIND.Fail) {
    throw new Error('expected an ok result');
  }
  return result.data;
}

describe('ValidateFileQueryHandler', () => {
  it('resolves the file id from the numeric projectId and returns it', async () => {
    const {services, getFileId} = makeServices();
    const handler = new ValidateFileQueryHandler(services);

    const result = await handler.handle(
      new ValidateFileQuery('7', undefined, 'client-1'),
    );

    expect(getFileId).toHaveBeenCalledWith(7);
    expect(dataOf(result).fileSystemId).toBe(String(FILE_SYSTEM_ID));
  });

  it('defaults the group to SAVE_FILE and runs the SAVE_FILE rules', async () => {
    const {services} = makeServices();
    const handler = new ValidateFileQueryHandler(services);

    const result = await handler.handle(
      new ValidateFileQuery('7', undefined, 'client-1'),
    );

    const data = dataOf(result);
    expect(data.group).toBe(VALIDATION_RULE_GROUP.SaveFile);
    expect(result.issues?.map(i => i.code)).toContain('ARC-MOD-005');
    expect(data.blockedSave).toBe(true);
    expect(data.summary.blocking).toBe(1);
    expect(Number.isNaN(Date.parse(data.runAt))).toBe(false);
  });

  it('uses an explicit group and does not run rules outside that group', async () => {
    const {services} = makeServices();
    const handler = new ValidateFileQueryHandler(services);

    const result = await handler.handle(
      new ValidateFileQuery('7', VALIDATION_RULE_GROUP.UploadFile, 'client-1'),
    );

    expect(dataOf(result).group).toBe(VALIDATION_RULE_GROUP.UploadFile);
    expect((result.issues ?? []).map(i => i.code)).not.toContain('ARC-MOD-005');
  });

  it('returns no issues and a zero summary for a clean file', async () => {
    const {services} = makeServices({modules: []});
    const handler = new ValidateFileQueryHandler(services);

    const result = await handler.handle(
      new ValidateFileQuery('7', undefined, 'client-1'),
    );

    expect(result.issues).toBeUndefined();
    expect(dataOf(result).blockedSave).toBe(false);
    expect(dataOf(result).summary.total).toBe(0);
  });

  it('propagates ResourceNotFoundException when the project has no file', async () => {
    const {services} = makeServices({
      getFileId: jest
        .fn()
        .mockRejectedValue(new ResourceNotFoundException('no file')),
    });
    const handler = new ValidateFileQueryHandler(services);

    await expect(
      handler.handle(new ValidateFileQuery('7', undefined, 'client-1')),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
  });
});
