export class SameNodeException extends Error {
  constructor(nodeId: number) {
    super(`Link cannot be connected to same node : ${nodeId}`);
  }
}
