import { DuplicateParamIdException, DuplicateSystemIdException, NullObjectException, ParamIdNotFoundException, SystemIdNotFoundException } from "../exceptions/input-validation-exception.js";
import type { ParamDefinition } from "./param-definition.js";

export interface ModuleDefinitionInit {
    systemId: number;
    moduleDefinitionId: number,
    name: string,
    displayName: string,
    description?: string,
    groupName?: string
}


export abstract class ModuleDefinition {
    systemId: number;
    readonly moduleDefinitionId: number;
    name: string;
    displayName: string;
    description: string;
    groupName: string;
    readonly parameters: ParamDefinition[] = [];

    constructor(initParam: ModuleDefinitionInit) {
        this.systemId = initParam.systemId;
        this.moduleDefinitionId = initParam.moduleDefinitionId;
        this.name = initParam.name;
        this.displayName = initParam.displayName;
        this.description = initParam.description ?? '';
        this.groupName = initParam.groupName ?? '';      
    }

    AddParameter(paramDefinition: ParamDefinition) {
        if (paramDefinition == null) {
            throw new NullObjectException("Value is null");
        }

        if (paramDefinition.systemId == null) {
            throw new SystemIdNotFoundException();
        }

        if (paramDefinition.paramId == null) {
            throw new ParamIdNotFoundException();
        }            

        // Check if systemId already exists in current values
        const valueWithSameSystemId = this.parameters.some(v => v.systemId === paramDefinition.systemId);
        if (valueWithSameSystemId) {
            throw new DuplicateSystemIdException(`SystemId ${paramDefinition.systemId} already exists in ModuleDefinition for key: ${this.moduleDefinitionId}`)
        }

        const valueWithSameParamId = this.parameters.some(v => v.paramId === paramDefinition.paramId);
        if (valueWithSameParamId) {
            throw new DuplicateParamIdException(`ParamId ${paramDefinition.paramId} already exists in ModuleDefinition for key: ${this.moduleDefinitionId}`)
        }

        this.parameters.push(paramDefinition);
    }
}