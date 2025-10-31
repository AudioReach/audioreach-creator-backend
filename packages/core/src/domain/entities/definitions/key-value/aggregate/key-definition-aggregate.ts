import { SpecialKey } from "../../common/enums/speciality-type.js"
import { DuplicateKeyValuePairException, DuplicateSystemIdException, NullObjectException, SystemIdNotFoundException, ValueIdNotFoundException } from "../../common/exceptions/input-validation-exception.js";
import { ValueDefinition } from "../entities/value-definition.entity.js";


export interface KeyDefinitionInit {
    systemId: number;
    keyId: number;
    name: string;

    cHeaderEnumName?: string;
    cHeaderEnumValue?: string;
    description?: string;
    isVoice?: boolean;
    isDynamic?: boolean;
    specialty?: SpecialKey;
    specialValue?: string;
    // Not available in SCHEMA
    isCalibrationKey?: boolean;
    isGraphKey?: boolean;

    calibrationEnumValue?: string;
    graphEnumValue?: string;
}

export class KeyDefinition {
    systemId: number;
    // member of key entity
    readonly keyId: number;
    name: string;
    readonly values: ValueDefinition[] = [];

    cHeaderEnumName: string;
    cHeaderEnumValue: string;
    description: string;
    isVoice: boolean;
    isDynamic: boolean;
    Specialty?: SpecialKey;
    specialValue?: string;

    // Not available in SCHEMA
    isCalibrationKey: boolean;
    isGraphKey: boolean;

    calibrationEnumValue: string;
    graphEnumValue: string;

    constructor(initParam: KeyDefinitionInit) {
        this.systemId = initParam.systemId;
        this.keyId = initParam.keyId;
        this.name = initParam.name;
        this.isCalibrationKey = initParam.isCalibrationKey ?? false;
        this.isGraphKey = initParam.isGraphKey ?? false;
        this.isVoice = initParam.isVoice ?? false;
        this.isDynamic = initParam.isDynamic ?? false;
        this.Specialty = initParam.specialty ?? SpecialKey.None;
        this.specialValue = initParam.specialValue ?? '';
        this.cHeaderEnumName = initParam.cHeaderEnumName ?? '';
        this.cHeaderEnumValue = initParam.cHeaderEnumValue ?? '';
        this.description = initParam.description ?? '';
        this.calibrationEnumValue = initParam.calibrationEnumValue ?? '';
        this.graphEnumValue = initParam.graphEnumValue ?? '';
    }

    AddValue(valueDefinition: ValueDefinition): void {
        if (valueDefinition == null) {
            throw new NullObjectException("Value is null");
        }

        if (valueDefinition.systemId == null) {
            throw new SystemIdNotFoundException();
        }

        if (valueDefinition.valueId == null) {
            throw new ValueIdNotFoundException();
        }

        // Check if systemId already exists in current values
        const valueWithSameSystemId = this.values.some(v => v.systemId === valueDefinition.systemId);
        if (valueWithSameSystemId) {
            throw new DuplicateSystemIdException(`SystemId ${valueDefinition.systemId} already exists in ValueDefinition for key: ${this.keyId}`)
        }

        const valueWithSameValueId = this.values.some(v => v.valueId === valueDefinition.valueId);
        if (valueWithSameValueId) {
            throw new DuplicateKeyValuePairException(`ValueId ${valueDefinition.valueId} already exists in ValueDefinition for key: ${this.keyId}`)
        }

        // If validation passes, add the value
        this.values.push(valueDefinition);
    }
}
