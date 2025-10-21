export class ControlLinkEntity {
  public systemId: number;
  public peerNodeASystemId: number;
  public peerNodeBSystemId: number;
  public nodeAPortSystemId: number;
  public nodeBPortSystemId: number;
  public heapId: number;
  public isInterGraph: boolean;

  constructor(
    systemId: number,
    peerNodeASystemId: number,
    peerNodeBSystemId: number,
    nodeAPortSystemId: number,
    nodeBPortSystemId: number,
    heapId: number,
    isInterGraph: boolean
  ) {
    this.systemId = systemId;
    this.peerNodeASystemId = peerNodeASystemId;
    this.peerNodeBSystemId = peerNodeBSystemId;
    this.nodeAPortSystemId = nodeAPortSystemId;
    this.nodeBPortSystemId = nodeBPortSystemId;
    this.heapId = heapId;
    this.isInterGraph = isInterGraph;
  }
}
