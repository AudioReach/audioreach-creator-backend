/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * One boundary-crossing segment of a control connection.
 *
 * `controlLinkSystemId` is a loose FK: a SubsystemControlLink may exist in an
 * `edit_actions` payload before the owning `ControlLink` is resolved
 * (`controlLinkSystemId = null`). Committed rows in the
 * `subsystem_control_links` table are always non-null — the commit pre-pass
 * (§11.9) discards unresolved segments before the transaction runs.
 *
 * Spec: §11.2.
 */
export class SubsystemControlLink {
  public systemId: number;
  public peerNodeASystemId: number;
  public peerNodeBSystemId: number;
  public nodeAPortSystemId: number;
  public nodeBPortSystemId: number;
  public controlLinkSystemId: number | null;
  public fileSystemId: number;
  public version: number;

  constructor(
    systemId: number,
    peerNodeASystemId: number,
    peerNodeBSystemId: number,
    nodeAPortSystemId: number,
    nodeBPortSystemId: number,
    controlLinkSystemId: number | null,
    fileSystemId: number,
    version: number,
  ) {
    this.systemId = systemId;
    this.peerNodeASystemId = peerNodeASystemId;
    this.peerNodeBSystemId = peerNodeBSystemId;
    this.nodeAPortSystemId = nodeAPortSystemId;
    this.nodeBPortSystemId = nodeBPortSystemId;
    this.controlLinkSystemId = controlLinkSystemId;
    this.fileSystemId = fileSystemId;
    this.version = version;
  }
}
