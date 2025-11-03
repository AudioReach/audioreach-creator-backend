import type { PortIoType } from "domain/node/port-io-type.js";
import { DataPortDefinition } from "./data-port-definition.js";
import { DataPortIdNotFoundException, DataPortNameNotFoundException, DuplicatePortIdException, DuplicatePortNameException, NullObjectException } from "../../common/exceptions/input-validation-exception.js";

export interface DataPortGroupDefinitionInit {
    max: number,
    portIoType: PortIoType
}

export class DataPortGroupDefinition {
    max: number;
    portIoType: PortIoType;
    readonly portDefinitions: DataPortDefinition[] = [];

    constructor(initParam: DataPortGroupDefinitionInit) {
        this.max = initParam.max;
        this.portIoType = initParam.portIoType;
    }

    AddPortDefinition(value: DataPortDefinition) {
        if (value == null) {
            throw new NullObjectException("Value is null");
        }

        if (value.dataPortId == null) {
            throw new DataPortIdNotFoundException();
        }

        if (value.dataPortName == null) {
            throw new DataPortNameNotFoundException();
        }

        const valueWithSamePortId = this.portDefinitions.some(v => v.dataPortId === value.dataPortId);
        if (valueWithSamePortId) {
            throw new DuplicatePortIdException(`Port Id: ${value.dataPortId} already exists for Port Type: ${this.portIoType}`)
        }

        const valueWithSamePortName = this.portDefinitions.some(v => v.dataPortName === value.dataPortName);
        if (valueWithSamePortName) {
            throw new DuplicatePortNameException(`Port Name: ${value.dataPortName} already exists for Port Type: ${this.portIoType}`)
        }

        this.portDefinitions.push(value);
    }
}
