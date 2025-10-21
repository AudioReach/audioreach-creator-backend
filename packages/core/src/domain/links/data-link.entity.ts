export class DataLinkEntity {
  public systemId: number;
  public sourceNodeSystemId: number;
  public destinationNodeSystemId: number;
  public sourcePortSystemId: number;
  public destinationPortSystemId: number;
  public isInterGraph: boolean;

  constructor(
    systemId: number,
    sourceNodeSystemId: number,
    destinationNodeSystemId: number,
    sourcePortSystemId: number,
    destinationPortSystemId: number,
    isInterGraph: boolean
  ) {
    this.systemId = systemId;
    this.sourceNodeSystemId = sourceNodeSystemId;
    this.destinationNodeSystemId = destinationNodeSystemId;
    this.sourcePortSystemId = sourcePortSystemId;
    this.destinationPortSystemId = destinationPortSystemId;
    this.isInterGraph = isInterGraph;
  }
}
