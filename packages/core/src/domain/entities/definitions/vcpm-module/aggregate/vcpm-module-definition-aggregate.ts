import { ModuleDefinition, type ModuleDefinitionInit } from "../../common/entities/module-definition-entity.js";

export interface VcpmModuleDefinitionInit extends ModuleDefinitionInit {
  
  fileSystemId: number;  
}

export class VcpmModuleDefinition extends ModuleDefinition {

    fileSystemId: number;  

    constructor(initParam: VcpmModuleDefinitionInit)
    {
        super({
            systemId: initParam.systemId,
            moduleDefinitionId: initParam.moduleDefinitionId,
            name: initParam.name,
            displayName: initParam.displayName,
            description: initParam.description,
            groupName: initParam.groupName
        }); 
        
        this.fileSystemId = initParam.fileSystemId;        
    }
}
