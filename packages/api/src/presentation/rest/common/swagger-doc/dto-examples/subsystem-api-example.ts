import { SubsystemDto } from '../../../modules/subsystem/dto/subsystem.dto.js';
import { KeyInfo } from '../../../modules/common/dtos/kv.dto.js';

export const subsystemApiExample = new SubsystemDto(
    "1",
    0xF0_10_00_01,
    "Device_RX",
    undefined
);

subsystemApiExample.filteredKeys = [
    new KeyInfo(0xA2_00_00_00, "DeviceRX")
];
