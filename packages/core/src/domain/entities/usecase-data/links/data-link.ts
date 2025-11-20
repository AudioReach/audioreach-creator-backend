import {SameNodeException} from './exceptions.js';

export class DataLink {
  public systemId: number;
  public sourceNodeSystemId: number;
  public destinationNodeSystemId: number;
  public sourcePortSystemId: number;
  public destinationPortSystemId: number;
  public isInterGraph: boolean;
  public naturalKeyHash: string;

  constructor(
    systemId: number,
    sourceNodeSystemId: number,
    destinationNodeSystemId: number,
    sourcePortSystemId: number,
    destinationPortSystemId: number,
    isInterGraph: boolean,
    naturalKeyHash: string,
  ) {
    this.systemId = systemId;
    this.sourceNodeSystemId = sourceNodeSystemId;
    this.destinationNodeSystemId = destinationNodeSystemId;
    this.sourcePortSystemId = sourcePortSystemId;
    this.destinationPortSystemId = destinationPortSystemId;
    this.isInterGraph = isInterGraph;
    this.naturalKeyHash = naturalKeyHash;
    if (this.sourceNodeSystemId == this.destinationNodeSystemId) {
      throw new SameNodeException(sourceNodeSystemId);
    }
  }
}
