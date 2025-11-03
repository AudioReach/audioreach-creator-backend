export interface ProcessorDefinitionInit
{
    systemId: string;
    name: string;
    processorDefinitionId: number;
}

export class ProcessorDefinition {
    systemId: string;
    name: string;
    readonly processorDefinitionId: number;

    constructor(initParam: ProcessorDefinitionInit)
    {
        this.systemId = initParam.systemId;
        this.name = initParam.name;
        this.processorDefinitionId = initParam.processorDefinitionId;
    }
}