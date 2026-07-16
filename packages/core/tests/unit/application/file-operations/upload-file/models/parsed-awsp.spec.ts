/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {describe, expect, it} from '@jest/globals';
import {ParsedAwsp} from '../../../../../../src/application/file-operations/upload-file/models/parsed-awsp.js';
import type {UiMetadata} from '../../../../../../src/application/file-operations/shared/awsp-serializers/v1/ui-metadata/index.js';

describe('ParsedAwsp.uiMetadata', () => {
  it('should return the set ui-metadata', () => {
    const p = new ParsedAwsp();
    const meta: UiMetadata = {
      version: {major: 1, minor: 0},
      payloadMap: [],
      usecases: [],
      subsystems: [],
      subgraphs: [],
      modules: [],
      dataLinks: [],
    };
    p.setUiMetadata(meta);
    expect(p.getUiMetadata()).toBe(meta);
  });
});
