import {
  ParamDefinition,
  type ParamDefinitionInit,
} from '../../common/entities/param-definition.js';

export interface VcpmParameterDefinitionInit extends ParamDefinitionInit {
  defaultData: Uint8Array;
}

export class VcpmParameterDefinition extends ParamDefinition {
  defaultData: Uint8Array;

  constructor(initParam: VcpmParameterDefinitionInit) {
    super({
      systemId: initParam.systemId,
      paramId: initParam.paramId,
      name: initParam.name,
      description: initParam.description,
      maxSize: initParam.maxSize,
      toolPolicies: initParam.toolPolicies,
      pidType: initParam.pidType,
      paramStructure: initParam.paramStructure,
    });

    this.defaultData = initParam.defaultData;
  }
}
