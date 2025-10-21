export const NodeType = {
  Module: "module",
  Subsystem: "subsystem",
} as const;

export type NodeType = (typeof NodeType)[keyof typeof NodeType];

export class NodeEntity {
  public systemId: number;
  public parentId?: number;
  public type: NodeType;
  public fileSystemId: number;

  constructor(systemId: number, type: NodeType, fileSystemId: number, parentId?: number) {
    this.systemId = systemId;
    this.type = type;
    this.fileSystemId = fileSystemId;
    this.parentId = parentId;
  }
}
