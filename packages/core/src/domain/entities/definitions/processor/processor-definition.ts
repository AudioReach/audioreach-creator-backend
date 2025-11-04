export interface ProcessorDefinitionInit {
  systemId: string;
  name: string;
  processorId: number;
}

export class ProcessorDefinition {
  systemId: string;
  name: string;
  readonly processorId: number;

  constructor(initParam: ProcessorDefinitionInit) {
    this.systemId = initParam.systemId;
    this.name = initParam.name;
    this.processorId = initParam.processorId;
  }
}
