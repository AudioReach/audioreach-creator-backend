export interface ControlLinkReadModel {
  readonly systemId: number;
  readonly peerNodeASystemId: number;
  readonly peerNodeBSystemId: number;
  readonly nodeAPortSystemId: number;
  readonly nodeBPortSystemId: number;
  readonly heapId: number;
  readonly isInterGraph: boolean;
}
