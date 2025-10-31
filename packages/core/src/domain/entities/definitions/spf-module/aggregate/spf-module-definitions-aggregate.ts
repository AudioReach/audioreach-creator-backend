import { Attribute } from "../value-objects/attribute.vo.js";
import { DataPortGroupDefinition } from "../value-objects/data-port-group-definition.vo.js";
import { DynamicIntentDefinition } from "../value-objects/dynamic-intent-definition.vo.js";
import { ModuleDefinitionMetaData } from "../value-objects/module-definition-meta-data.vo.js";
import { StaticControlPortDefinition } from "../value-objects/static-control-port-definition.vo.js";
import { ModuleDefinition, type ModuleDefinitionInit } from "../../common/entities/module-definition-entity.js";
import { PortIoType } from "domain/node/port-io-type.js";
import { AttributeNameNotFoundException, AttributeValueNotFoundException, DuplicateAttributeNameException, DuplicateContainerTypeReferenceIdException, DuplicateDataInputPortGroupException, DuplicateDataOutputPortGroupException, DuplicateIntentIdException, DuplicateIntentNameException, DuplicatePortIdException, DuplicatePortNameException, DuplicateProcessorDefinitionReferenceIdException, DuplicateProcessorIdException, IntentIdNotFoundException, IntentNameNotFoundException, NullObjectException, PortIOTypeNotFoundException, ProcessorDefinitionNameNotFoundException, StaticPortIdNotFoundException, StaticPortNameNotFoundException } from "../../common/exceptions/input-validation-exception.js";

export interface SpfModuleDefinitionInit extends ModuleDefinitionInit {

    metaData?: ModuleDefinitionMetaData;
    dynamicIntents?: DynamicIntentDefinition[];
}


export class SpfModuleDefinition extends ModuleDefinition {
    attributes: Attribute[] = [];
    metaData: ModuleDefinitionMetaData = new ModuleDefinitionMetaData({}); //ToDo
    readonly dataPortGroups: DataPortGroupDefinition[] = [];
    readonly staticPorts: StaticControlPortDefinition[] = [];
    readonly dynamicIntents: DynamicIntentDefinition[] = [];
    readonly processorDefinitionReferenceIds: number[] = [];
    readonly containerTypesReferenceIds: number[] = [];


    // Missing for schema:
    // Stacksize
    // ArcModuleDirectionType DirectionType { get; set; }
    //   ArcMdfModuleType MdfModuleType { get; set; }
    //   string SearchKeys { get; set; }
    //   bool? IsOffloadable { get; set; }
    //   bool BuiltIn { get; set; }      

    //   ArcMajorModuleType MajorModuleType { get; set; }
    //   ArcBuildType BuildType { get; set; }
    //   bool? IslandFriendly { get; set; }

    //   IArcCustomModuleInfo CustomModuleInfo { get; set; }

    //   string GroupName { get; set; }

    //     string RtmLogCode { get; set; }
    //     uint? ReplacedBy { get; set; }
    //     bool? Deprecated { get; set; }
    //     bool HasNeuralNetParam { get; set; }  

    constructor(initParam: SpfModuleDefinitionInit) {
        super({
            systemId: initParam.systemId,
            moduleDefinitionId: initParam.moduleDefinitionId,
            name: initParam.name,
            displayName: initParam.displayName,
            description: initParam.description,
            groupName: initParam.groupName
        });
    }



    AddAttribute(attribute: Attribute) {
        if (attribute == null) {
            throw new NullObjectException("Value is null");
        }

        if (attribute.name == null) {
            throw new AttributeNameNotFoundException();
        }

        if (attribute.value == null) {
            throw new AttributeValueNotFoundException();
        }

        const existingAttribute = this.attributes.some(a => a.name === attribute.name);
        if (existingAttribute) {
            throw new DuplicateAttributeNameException(`Attribute name: ${attribute.name} already exists for SPF Module Definition: ${this.moduleDefinitionId}`);
        }

        this.attributes.push(attribute);
    }

    AddPortGroup(dataPortGroup: DataPortGroupDefinition) {
        if (dataPortGroup == null) {
            throw new NullObjectException("Value is null");
        }

        if (dataPortGroup.portIoType === undefined || dataPortGroup.portIoType === null) {
            throw new PortIOTypeNotFoundException();
        }

        if (dataPortGroup.portIoType === PortIoType.Input) {
            const valueWithInputGroup = this.dataPortGroups.filter(group => group.portIoType === PortIoType.Input);

            if (valueWithInputGroup.length > 0) {
                throw new DuplicateDataInputPortGroupException(`Input Port Group already exists for SPF Module Definition: ${this.moduleDefinitionId}`)
            }
        }

        if (dataPortGroup.portIoType === PortIoType.Output) {
            const valueWithOutputGroup = this.dataPortGroups.filter(group => group.portIoType === PortIoType.Output);

            if (valueWithOutputGroup.length > 0) {
                throw new DuplicateDataOutputPortGroupException(`Output Port Group already exists for SPF Module Definition: ${this.moduleDefinitionId}`)
            }
        }

        this.dataPortGroups.push(dataPortGroup);
    }

    AddDynamicIntentDefinition(dynamicIntentDefinition: DynamicIntentDefinition) {
        if (dynamicIntentDefinition == null) {
            throw new NullObjectException("Value is null");
        }

        if (dynamicIntentDefinition.intentId === undefined || dynamicIntentDefinition.intentId === null) {
            throw new IntentIdNotFoundException();
        }

        if (dynamicIntentDefinition.name === undefined || dynamicIntentDefinition.name === null) {
            throw new IntentNameNotFoundException();
        }

        const valueWithSameIntentId = this.dynamicIntents.some(v => v.intentId === dynamicIntentDefinition.intentId);
        if (valueWithSameIntentId) {
            throw new DuplicateIntentIdException(`Intent Id: ${dynamicIntentDefinition.intentId} already exists for SPF Module Definition: ${this.moduleDefinitionId}`)
        }

        const valueWithSamePortName = this.dynamicIntents.some(v => v.name === dynamicIntentDefinition.name);
        if (valueWithSamePortName) {
            throw new DuplicateIntentNameException(`Intent Name: ${dynamicIntentDefinition.name} already exists for SPF Module Definition: ${this.moduleDefinitionId}`)
        }

        this.dynamicIntents.push(dynamicIntentDefinition);
    }

    AddStaticControlPort(staticPort: StaticControlPortDefinition) {
        if (staticPort == null) {
            throw new NullObjectException("Value is null");
        }

        if (staticPort.portId === undefined || staticPort.portId === null) {
            throw new StaticPortIdNotFoundException();
        }

        if (staticPort.portName === undefined || staticPort.portName === null) {
            throw new StaticPortNameNotFoundException();
        }

        const valueWithSamePortId = this.staticPorts.some(v => v.portId === staticPort.portId);
        if (valueWithSamePortId) {
            throw new DuplicatePortIdException(`Port Id: ${staticPort.portId} already exists for SPF Module Definition: ${this.moduleDefinitionId}`)
        }

        const valueWithSamePortName = this.staticPorts.some(v => v.portName === staticPort.portName);
        if (valueWithSamePortName) {
            throw new DuplicatePortNameException(`Port Name: ${staticPort.portName} already exists for SPF Module Definition: ${this.moduleDefinitionId}`)
        }

        this.staticPorts.push(staticPort);
    }

    AddProcessDefinition(processorDefinitionReferenceId: number) {
        if (processorDefinitionReferenceId === undefined || processorDefinitionReferenceId === null) {
            throw new NullObjectException("Value is null");
        }

        const existingProcessorDefinitionReferenceId = this.processorDefinitionReferenceIds.find(id => id === processorDefinitionReferenceId);
        if (existingProcessorDefinitionReferenceId) {
            throw new DuplicateProcessorDefinitionReferenceIdException(`Processor Definition Reference Id: ${processorDefinitionReferenceId} already exists for SPF Module Definition: ${this.moduleDefinitionId}`);
        }

        this.processorDefinitionReferenceIds.push(processorDefinitionReferenceId);
    }

    AddContainerType(containerTypeReferenceIds: number) {
        if (containerTypeReferenceIds === undefined || containerTypeReferenceIds === null) {
            throw new NullObjectException("Value is null");
        }

        const existingContainerTypeReferenceId = this.containerTypesReferenceIds.find(id => id === containerTypeReferenceIds);
        if (existingContainerTypeReferenceId) {
            throw new DuplicateContainerTypeReferenceIdException(`Container Type Reference Id: ${containerTypeReferenceIds} already exists for SPF Module Definition: ${this.moduleDefinitionId}`);
        }

        this.containerTypesReferenceIds.push(containerTypeReferenceIds);
    }
}
