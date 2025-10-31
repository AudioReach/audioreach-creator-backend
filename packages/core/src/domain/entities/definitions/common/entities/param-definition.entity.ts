import type { PID_TYPE } from "../enums/pid-type.js";
import type { TOOL_POLICY } from "../enums/tool-policy-type.js";

export interface ParamDefinitionInit
{
    systemId: number;
    paramId: string,
    name: string,
    description: string,
    maxSize: number,
    toolPolicies: TOOL_POLICY[],
    pidType: PID_TYPE,
    paramStructure: string

}

export class ParamDefinition {
    systemId: number;
     readonly paramId: string;
     name: string;
     description: string;
     maxSize: number;
     toolPolicies: TOOL_POLICY[];
     pidType: PID_TYPE;
     paramStructure: string;

    constructor(initParam: ParamDefinitionInit) {
        this.systemId = initParam.systemId;
        this.paramId = initParam.paramId;
        this.name = initParam.name;
        this.description = initParam.description;
        this.maxSize = initParam.maxSize;
        this.toolPolicies = initParam.toolPolicies;
        this.pidType = initParam.pidType;
        this.paramStructure = initParam.paramStructure;
    }
}