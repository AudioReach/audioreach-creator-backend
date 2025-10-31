export interface ModuleDefinitionMetaDataInit
{
   value?: string
}

export class ModuleDefinitionMetaData
{
    value?: string;

    constructor(initParam: ModuleDefinitionMetaDataInit) {
        this.value = initParam.value;
    }
}
