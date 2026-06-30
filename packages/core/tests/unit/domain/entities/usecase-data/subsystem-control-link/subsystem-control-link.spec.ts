/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {SubsystemControlLink} from '@arc/core';

describe('SubsystemControlLink (spec §11.2)', () => {
  it('exposes all eight fields from the spec via the constructor in order', () => {
    const scl = new SubsystemControlLink(
      /* systemId            */ 9001,
      /* peerNodeASystemId   */ 10,
      /* peerNodeBSystemId   */ 20,
      /* nodeAPortSystemId   */ 100,
      /* nodeBPortSystemId   */ 200,
      /* controlLinkSystemId */ 5000,
      /* fileSystemId        */ 1,
      /* version             */ 1,
    );
    expect(scl.systemId).toBe(9001);
    expect(scl.peerNodeASystemId).toBe(10);
    expect(scl.peerNodeBSystemId).toBe(20);
    expect(scl.nodeAPortSystemId).toBe(100);
    expect(scl.nodeBPortSystemId).toBe(200);
    expect(scl.controlLinkSystemId).toBe(5000);
    expect(scl.fileSystemId).toBe(1);
    expect(scl.version).toBe(1);
  });

  it('accepts null controlLinkSystemId (unresolved edit_actions payload, spec §11.2)', () => {
    const scl = new SubsystemControlLink(9002, 10, 20, 100, 200, null, 1, 1);
    expect(scl.controlLinkSystemId).toBeNull();
  });
});
