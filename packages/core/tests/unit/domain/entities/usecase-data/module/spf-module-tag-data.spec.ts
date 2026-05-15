/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeEach} from '@jest/globals';
import {SpfModule} from '../../../../../../src/domain/entities/usecase-data/module/spf-module.js';
import {TagData} from '../../../../../../src/domain/entities/usecase-data/module/entities/spf-module-tag-data.js';
import {asSystemId} from '../../../../../../src/shared/types/branded-ids.js';

describe('SpfModule - hasTag()', () => {
  let spfModule: SpfModule;

  beforeEach(() => {
    spfModule = new SpfModule({
      systemId: asSystemId(1),
      instanceId: 100,
      definitionSystemId: asSystemId(10),
      containerSystemId: asSystemId(20),
      subgraphSystemId: asSystemId(30),
      fileSystemId: 1,
      dataPorts: [],
      controlPorts: [],
    });
  });

  it('should return false when module has no tags', () => {
    expect(spfModule.hasTag(999)).toBe(false);
  });

  it('should return true when module has the specified tag', () => {
    const tagData = new TagData({
      systemId: asSystemId(500),
      tagDefinitionSystemId: asSystemId(999),
    });

    spfModule.addTagData(tagData);

    expect(spfModule.hasTag(999)).toBe(true);
  });

  it('should return false when module has different tags', () => {
    const tagData1 = new TagData({
      systemId: asSystemId(500),
      tagDefinitionSystemId: asSystemId(111),
    });
    const tagData2 = new TagData({
      systemId: asSystemId(501),
      tagDefinitionSystemId: asSystemId(222),
    });

    spfModule.addTagData(tagData1);
    spfModule.addTagData(tagData2);

    expect(spfModule.hasTag(999)).toBe(false);
  });

  it('should return true for any of multiple tags', () => {
    const tagData1 = new TagData({
      systemId: asSystemId(500),
      tagDefinitionSystemId: asSystemId(111),
    });
    const tagData2 = new TagData({
      systemId: asSystemId(501),
      tagDefinitionSystemId: asSystemId(222),
    });

    spfModule.addTagData(tagData1);
    spfModule.addTagData(tagData2);

    expect(spfModule.hasTag(111)).toBe(true);
    expect(spfModule.hasTag(222)).toBe(true);
  });

  it('should use O(1) Set lookup for performance', () => {
    // Add many tags
    for (let i = 0; i < 1000; i++) {
      const tagData = new TagData({
        systemId: asSystemId(500 + i),
        tagDefinitionSystemId: asSystemId(1000 + i),
      });
      spfModule.addTagData(tagData);
    }

    // Lookup should be fast (O(1))
    const start = performance.now();
    const result = spfModule.hasTag(1500);
    const duration = performance.now() - start;

    expect(result).toBe(true);
    expect(duration).toBeLessThan(1); // Should be sub-millisecond
  });
});
