import {ApiProperty} from '@nestjs/swagger';
import {
  DataTypeEnum,
  DisplayTypeEnum,
  ElementPolicyEnum,
  CalElementTypeEnum,
} from './enums.js';

/**
 * Valid value option with display name
 */
export type ValueMetaData = {
  value: string;
  name: string;
};

/**
 * Base properties for all calibration elements
 */
export type CalElementBase = {
  type: CalElementTypeEnum;
  name: string;
  description?: string;
  group?: string;
  subgroup?: string;
};

/**
 * Array-specific metadata properties
 */
export type ConfigArrayMetaData = {
  length?: number;
  lengthFormula?: string;
};

/**
 * Configuration element DTO for calibration data
 */
export class ConfigElementDto implements CalElementBase {
  @ApiProperty({
    description: 'Element type identifier',
    example: 'ConfigElement',
    enum: Object.values(CalElementTypeEnum),
  })
  type!: CalElementTypeEnum;

  @ApiProperty({
    description: 'Element name',
    example: 'volume_level',
  })
  name!: string;

  @ApiProperty({
    description: 'Optional element description',
    example: 'Audio volume level setting',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description: 'Group name for organizing elements',
    example: 'Audio Controls',
    required: false,
  })
  group?: string;

  @ApiProperty({
    description: 'Sub-group name for further categorization',
    example: 'Volume Settings',
    required: false,
  })
  subgroup?: string;

  @ApiProperty({
    description: 'Data type of the configuration element',
    enum: Object.values(DataTypeEnum),
    example: 'UInt32',
  })
  dataType!: DataTypeEnum;

  @ApiProperty({
    description: 'Current or default value',
    example: '75',
  })
  value!: string;

  @ApiProperty({
    description: 'Unit of measurement',
    example: 'dB',
    required: false,
  })
  unit?: string;

  @ApiProperty({
    description: 'Whether the element is read-only',
    example: false,
    required: false,
  })
  isReadOnly?: boolean;

  @ApiProperty({
    description: 'Display type for UI rendering',
    enum: Object.values(DisplayTypeEnum),
    example: 'Slider',
    required: false,
  })
  displayType?: DisplayTypeEnum;

  @ApiProperty({
    description: 'Element policy for visibility and access control',
    enum: Object.values(ElementPolicyEnum),
    example: 'Basic',
    required: false,
  })
  policy?: ElementPolicyEnum;

  @ApiProperty({
    description: 'Q format string for fixed-point representation',
    example: 'Q15',
    required: false,
  })
  qFormat?: string;

  @ApiProperty({
    description: 'Precision value for decimal places',
    example: 2,
    minimum: 0,
    required: false,
  })
  precision?: number;

  @ApiProperty({
    description: 'Minimum allowed value for this configuration element',
    example: '0',
    required: false,
  })
  min!: string;

  @ApiProperty({
    description: 'Maximum allowed value for this configuration element',
    example: '100',
    required: false,
  })
  max!: string;

  @ApiProperty({
    description: 'Array of valid values with their display names',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        value: {type: 'string', description: 'The actual value'},
        name: {type: 'string', description: 'Display name for the value'},
      },
    },
    example: [
      {value: '0', name: 'Disabled'},
      {value: '1', name: 'Low'},
      {value: '2', name: 'Medium'},
      {value: '3', name: 'High'},
    ],
    required: false,
  })
  validValues?: ValueMetaData[];

  //TODO: Add bitfileds

  @ApiProperty({
    description:
      'List of elements linked by formula - important for calibration dependencies',
    type: [String],
    example: ['gain_factor', 'offset_value'],
    required: false,
  })
  linkedByForFormula?: string[];
}

/**
 * Configuration element array DTO for calibration data
 */
export class ConfigArrayDto implements CalElementBase, ConfigArrayMetaData {
  @ApiProperty({
    description: 'Element type identifier',
    example: 'ConfigElementArray',
    enum: Object.values(CalElementTypeEnum),
  })
  type!: CalElementTypeEnum;

  @ApiProperty({
    description: 'Element name',
    example: 'eq_bands',
  })
  name!: string;

  @ApiProperty({
    description: 'Optional element description',
    example: 'Equalizer band settings',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description: 'Group name for organizing elements',
    example: 'Audio Processing',
    required: false,
  })
  group?: string;

  @ApiProperty({
    description: 'Sub-group name for further categorization',
    example: 'Equalizer',
    required: false,
  })
  subgroup?: string;

  @ApiProperty({
    description: 'Array length',
    example: 10,
    minimum: 0,
    required: false,
  })
  length?: number;

  @ApiProperty({
    description: 'Array length formula string',
    example: 'num_channels * 2',
    required: false,
  })
  lengthFormula?: string;

  @ApiProperty({
    description: 'Template configuration element for array items',
    type: () => ConfigElementDto,
  })
  template!: ConfigElementDto;

  @ApiProperty({
    description: 'Array of configuration elements',
    type: [ConfigElementDto],
  })
  elements!: ConfigElementDto[];

  @ApiProperty({
    description: 'Whether the array is read-only',
    example: false,
    required: false,
  })
  isReadOnly?: boolean;
}

/**
 * Structure element DTO for calibration data
 */
export class ConfigStructDto implements CalElementBase {
  @ApiProperty({
    description: 'Element type identifier',
    example: 'Struct',
    enum: Object.values(CalElementTypeEnum),
  })
  type!: CalElementTypeEnum;

  @ApiProperty({
    description: 'Element name',
    example: 'audio_settings',
  })
  name!: string;

  @ApiProperty({
    description: 'Optional element description',
    example: 'Audio configuration settings',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description: 'Group name for organizing elements',
    example: 'System Config',
    required: false,
  })
  group?: string;

  @ApiProperty({
    description: 'Sub-group name for further categorization',
    example: 'Audio Settings',
    required: false,
  })
  subgroup?: string;

  @ApiProperty({
    description: 'Structure type identifier',
    example: 'AudioConfig',
  })
  structType!: string;

  @ApiProperty({
    description: 'Child elements within the structure',
    type: 'array',
    items: {
      oneOf: [
        {$ref: '#/components/schemas/ConfigElementDto'},
        {$ref: '#/components/schemas/ConfigArrayDto'},
        {$ref: '#/components/schemas/ConfigStructDto'},
        {$ref: '#/components/schemas/ConfigStructArrayDto'},
      ],
    },
  })
  elements!: CalElementDto[];
}

/**
 * Structure array DTO for calibration data
 */
export class ConfigStructArrayDto
  implements CalElementBase, ConfigArrayMetaData
{
  @ApiProperty({
    description: 'Element type identifier',
    example: 'StructArray',
    enum: Object.values(CalElementTypeEnum),
  })
  type!: CalElementTypeEnum;

  @ApiProperty({
    description: 'Element name',
    example: 'channel_configs',
  })
  name!: string;

  @ApiProperty({
    description: 'Optional element description',
    example: 'Per-channel audio configuration settings',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description: 'Group name for organizing elements',
    example: 'Channel Settings',
    required: false,
  })
  group?: string;

  @ApiProperty({
    description: 'Sub-group name for further categorization',
    example: 'Multi-Channel',
    required: false,
  })
  subgroup?: string;

  @ApiProperty({
    description: 'Array length',
    example: 2,
    minimum: 0,
    required: false,
  })
  length?: number;

  @ApiProperty({
    description: 'Array length formula string',
    example: 'num_channels',
    required: false,
  })
  lengthFormula?: string;

  @ApiProperty({
    description: 'Template structure for array items',
    type: () => ConfigStructDto,
  })
  template!: ConfigStructDto;

  @ApiProperty({
    description: 'Array of structure elements',
    type: [ConfigStructDto],
  })
  elements!: ConfigStructDto[];
}

/**
 * Union type for all possible calibration element types
 */
export type CalElementDto =
  | ConfigElementDto
  | ConfigArrayDto
  | ConfigStructDto
  | ConfigStructArrayDto;

/**
 * Main DTO for calibration data containing a list of elements
 */
export class CalDataDto {
  @ApiProperty({
    description: 'List of calibration elements',
    type: 'array',
    items: {
      oneOf: [
        {$ref: '#/components/schemas/ConfigElementDto'},
        {$ref: '#/components/schemas/ConfigArrayDto'},
        {$ref: '#/components/schemas/ConfigStructDto'},
        {$ref: '#/components/schemas/ConfigStructArrayDto'},
      ],
    },
    example: [
      {
        type: 'ConfigElement',
        name: 'volume_level',
        description: 'Audio volume level setting',
        group: 'Audio Controls',
        subgroup: 'Volume Settings',
        dataType: 'UInt32',
        value: '75',
        displayName: 'Volume Level',
        unit: 'dB',
        displayType: 'Slider',
        policy: 'Basic',
        precision: 1,
        min: '0',
        max: '100',
        validValues: [
          {value: '0', name: 'Mute'},
          {value: '25', name: 'Low'},
          {value: '50', name: 'Medium'},
          {value: '75', name: 'High'},
          {value: '100', name: 'Maximum'},
        ],
        isReadOnly: false,
        linkedByForFormula: ['gain_factor'],
      },
      {
        type: 'ConfigElementArray',
        name: 'eq_bands',
        description: 'Equalizer band settings',
        group: 'Audio Processing',
        length: 10,
        lengthFormula: 'num_eq_bands',
        template: {
          type: 'ConfigElement',
          name: 'eq_band',
          dataType: 'Float',
          value: '0.0',
          unit: 'dB',
          displayType: 'TextBox',
          qFormat: 'Q15',
        },
        elements: [
          {
            type: 'ConfigElement',
            name: 'eq_band_1',
            dataType: 'Float',
            value: '2.5',
            unit: 'dB',
            displayType: 'TextBox',
            qFormat: 'Q15',
          },
          {
            type: 'ConfigElement',
            name: 'eq_band_2',
            dataType: 'Float',
            value: '-1.0',
            unit: 'dB',
            displayType: 'TextBox',
            qFormat: 'Q15',
          },
        ],
        isReadOnly: false,
      },
      {
        type: 'Struct',
        name: 'audio_settings',
        description: 'Audio configuration settings',
        group: 'System Config',
        structType: 'AudioConfig',
        elements: [
          {
            type: 'ConfigElement',
            name: 'sample_rate',
            dataType: 'UInt32',
            value: '48000',
            unit: 'Hz',
            displayType: 'DropDown',
            policy: 'Advanced',
          },
        ],
      },
    ],
  })
  elements!: CalElementDto[];
}

/**
 * PID-specific data DTO
 *
 * Represents configuration data for a specific Parameter ID (PID).
 * Each PID corresponds to a unique module parameter and contains various types of
 * configuration elements that define how the parameter can be configured and tuned.
 *
 * PIDs are used to organize data hierarchically, where each PID
 * represents a distinct configurable aspect of a module (e.g., volume control,
 * equalizer settings, filter parameters, etc.).
 *
 * This DTO is shared between calibration data (cal-data) and tag data (tag-data) APIs.
 */
export class PidDataDto {
  @ApiProperty({
    description: 'System identifier',
    example: 'SYS001',
  })
  systemId!: string;

  @ApiProperty({
    description:
      'Parameter ID (PID) - Unique identifier for a module parameter.\n\n' +
      'PIDs are used to organize calibration data where each PID represents:\n' +
      '- A specific configurable parameter of the module\n' +
      '- A logical grouping of related calibration elements\n' +
      '- A distinct tuning aspect (e.g., volume, EQ, filters)\n\n' +
      'Examples:\n' +
      '- PID "1" might represent volume control parameters\n' +
      '- PID "2" might represent equalizer band settings\n' +
      '- PID "3" might represent filter coefficients',
    example: '1',
    required: false,
  })
  pid?: string;

  @ApiProperty({
    description: 'Human-readable name for this PID',
    example: 'Volume Control Parameters',
    required: false,
  })
  name?: string;

  @ApiProperty({
    description: 'Description of what this PID represents',
    example: 'Contains all volume-related configuration parameters',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description:
      'Array of calibration elements for this Parameter ID.\n\n' +
      'This array can contain four different types of calibration elements:\n\n' +
      '**1. ConfigElement (Simple Parameters):**\n' +
      '   - Single configuration values (volume, gain, frequency)\n' +
      '   - Rendered as UI controls like sliders, text boxes, dropdowns\n' +
      '   - Example: volume_level with value "75" and unit "dB"\n\n' +
      '**2. ConfigElementArray (Parameter Arrays):**\n' +
      '   - Arrays of configuration values of the same type\n' +
      '   - Used for multi-band EQs, filter coefficients, channel gains\n' +
      '   - Contains template defining the structure of each array item\n' +
      '   - Example: eq_bands array with 10 frequency band settings\n\n' +
      '**3. Struct (Grouped Parameters):**\n' +
      '   - Complex structured data grouping related parameters\n' +
      '   - Contains nested elements of any calibration type\n' +
      '   - Used for organizing related settings (audio_config, filter_settings)\n' +
      '   - Example: audio_settings struct containing sample_rate, bit_depth, etc.\n\n' +
      '**4. StructArray (Arrays of Structures):**\n' +
      '   - Arrays of structured data for multi-instance configurations\n' +
      '   - Used for multi-channel setups, multiple filter stages\n' +
      '   - Contains template defining the structure of each array item\n' +
      '   - Example: channel_configs array with settings for each audio channel\n\n' +
      '**Element Relationships:**\n' +
      '- Elements can be nested (Structs can contain other elements)\n' +
      '- Elements can reference each other via linkedByForFormula\n' +
      '- Array elements follow their template structure\n' +
      '- All elements support grouping via group/subgroup for UI organization',
    type: 'array',
    items: {
      oneOf: [
        {$ref: '#/components/schemas/ConfigElementDto'},
        {$ref: '#/components/schemas/ConfigArrayDto'},
        {$ref: '#/components/schemas/ConfigStructDto'},
        {$ref: '#/components/schemas/ConfigStructArrayDto'},
      ],
    },
    example: [
      {
        type: 'ConfigElement',
        name: 'volume_level',
        description: 'Master volume control for audio output',
        group: 'Audio Controls',
        subgroup: 'Volume Settings',
        dataType: 'UInt32',
        value: '75',
        unit: 'dB',
        displayType: 'Slider',
        policy: 'Basic',
        precision: 1,
        min: '0',
        max: '100',
        validValues: [
          {value: '0', name: 'Mute'},
          {value: '25', name: 'Low'},
          {value: '50', name: 'Medium'},
          {value: '75', name: 'High'},
          {value: '100', name: 'Maximum'},
        ],
        isReadOnly: false,
        linkedByForFormula: ['gain_compensation'],
      },
      {
        type: 'ConfigElementArray',
        name: 'eq_bands',
        description: 'Equalizer frequency band gain settings',
        group: 'Audio Processing',
        subgroup: 'Equalizer',
        length: 5,
        lengthFormula: 'num_eq_bands',
        template: {
          type: 'ConfigElement',
          name: 'band_gain',
          dataType: 'Float',
          value: '0.0',
          unit: 'dB',
          displayType: 'Slider',
          qFormat: 'Q15',
          precision: 2,
        },
        elements: [
          {
            type: 'ConfigElement',
            name: 'eq_band_1',
            dataType: 'Float',
            value: '2.5',
            unit: 'dB',
            displayType: 'Slider',
            qFormat: 'Q15',
            precision: 2,
          },
          {
            type: 'ConfigElement',
            name: 'eq_band_2',
            dataType: 'Float',
            value: '-1.0',
            unit: 'dB',
            displayType: 'Slider',
            qFormat: 'Q15',
            precision: 2,
          },
          {
            type: 'ConfigElement',
            name: 'eq_band_3',
            dataType: 'Float',
            value: '0.5',
            unit: 'dB',
            displayType: 'Slider',
            qFormat: 'Q15',
            precision: 2,
          },
        ],
        isReadOnly: false,
      },
      {
        type: 'Struct',
        name: 'filter_config',
        description: 'Digital filter configuration parameters',
        group: 'Audio Processing',
        subgroup: 'Filters',
        structType: 'FilterConfig',
        elements: [
          {
            type: 'ConfigElement',
            name: 'cutoff_frequency',
            dataType: 'UInt32',
            value: '1000',
            unit: 'Hz',
            displayType: 'TextBox',
            policy: 'Advanced',
          },
          {
            type: 'ConfigElement',
            name: 'filter_type',
            dataType: 'UInt8',
            value: '1',
            displayType: 'DropDown',
            policy: 'Basic',
          },
        ],
      },
      {
        type: 'StructArray',
        name: 'channel_configs',
        description: 'Per-channel audio configuration settings',
        group: 'Channel Settings',
        length: 2,
        lengthFormula: 'num_channels',
        template: {
          type: 'Struct',
          name: 'channel_config',
          structType: 'ChannelConfig',
          elements: [
            {
              type: 'ConfigElement',
              name: 'channel_gain',
              dataType: 'Float',
              value: '1.0',
              unit: 'linear',
              displayType: 'Slider',
            },
          ],
        },
        elements: [
          {
            type: 'Struct',
            name: 'channel_config_left',
            structType: 'ChannelConfig',
            elements: [
              {
                type: 'ConfigElement',
                name: 'channel_gain',
                dataType: 'Float',
                value: '0.8',
                unit: 'linear',
                displayType: 'Slider',
              },
            ],
          },
          {
            type: 'Struct',
            name: 'channel_config_right',
            structType: 'ChannelConfig',
            elements: [
              {
                type: 'ConfigElement',
                name: 'channel_gain',
                dataType: 'Float',
                value: '0.9',
                unit: 'linear',
                displayType: 'Slider',
              },
            ],
          },
        ],
      },
    ],
  })
  elements!: CalElementDto[];
}

/**
 * Response DTO for calibration data API - supports multiple PIDs
 */
export class CalDataResponseDto {
  @ApiProperty({
    description: 'Array of calibration data, one for each PID',
    type: [PidDataDto],
    example: [
      {
        systemId: 'SYS001',
        pid: '1',
        name: 'Volume Control Parameters',
        description: 'Contains all volume-related configuration parameters',
        elements: [
          {
            type: 'ConfigElement',
            name: 'volume_level',
            description: 'Audio volume level setting',
            group: 'Audio Controls',
            subgroup: 'Volume Settings',
            dataType: 'UInt32',
            value: '75',
            unit: 'dB',
            displayType: 'Slider',
            policy: 'Basic',
            precision: 1,
            min: '0',
            max: '100',
            validValues: [
              {value: '0', name: 'Mute'},
              {value: '25', name: 'Low'},
              {value: '50', name: 'Medium'},
              {value: '75', name: 'High'},
              {value: '100', name: 'Maximum'},
            ],
            isReadOnly: false,
          },
        ],
      },
      {
        systemId: 'SYS001',
        pid: '2',
        name: 'Audio Processing Parameters',
        description: 'Contains audio processing configuration parameters',
        elements: [
          {
            type: 'ConfigElement',
            name: 'sample_rate',
            description: 'Audio sample rate setting',
            group: 'Audio Processing',
            dataType: 'UInt32',
            value: '48000',
            unit: 'Hz',
            displayType: 'DropDown',
            policy: 'Advanced',
          },
        ],
      },
    ],
  })
  data!: PidDataDto[];
}

/**
 * Response DTO for tag data API - supports multiple PIDs with tag context
 */
export class TkvDataDto {
  @ApiProperty({
    description: 'Array of PID data for this tag',
    type: [PidDataDto],
    example: [
      {
        systemId: 'SYS002',
        pid: '1',
        name: 'Tag Volume Control Parameters',
        description: 'Tag-specific volume control configuration parameters',
        elements: [
          {
            type: 'ConfigElement',
            name: 'tag_volume_level',
            description: 'Tag-specific volume level setting',
            group: 'Tag Audio Controls',
            subgroup: 'Volume Settings',
            dataType: 'UInt32',
            value: '75',
            unit: 'dB',
            displayType: 'Slider',
            policy: 'Basic',
            precision: 1,
            min: '0',
            max: '100',
            validValues: [
              {value: '0', name: 'Mute'},
              {value: '25', name: 'Low'},
              {value: '50', name: 'Medium'},
              {value: '75', name: 'High'},
              {value: '100', name: 'Maximum'},
            ],
            isReadOnly: false,
          },
        ],
      },
    ],
  })
  data!: PidDataDto[];
}

/**
 * Request DTO for updating calibration data - supports multiple PIDs
 */
export class UpdateCalDataRequestDto {
  @ApiProperty({
    description: 'Array of calibration data updates for multiple PIDs',
    type: [PidDataDto],
    example: [
      {
        systemId: 'SYS001',
        pid: '1',
        name: 'Volume Control Parameters',
        description: 'Updated volume-related configuration parameters',
        elements: [
          {
            type: 'ConfigElement',
            name: 'volume_level',
            description: 'Audio volume level setting',
            group: 'Audio Controls',
            subgroup: 'Volume Settings',
            dataType: 'UInt32',
            value: '80',
            unit: 'dB',
            displayType: 'Slider',
            policy: 'Basic',
            precision: 1,
            min: '0',
            max: '100',
            validValues: [
              {value: '0', name: 'Mute'},
              {value: '20', name: 'Low'},
              {value: '50', name: 'Medium'},
              {value: '80', name: 'High'},
              {value: '100', name: 'Maximum'},
            ],
            isReadOnly: false,
          },
        ],
      },
    ],
  })
  data!: PidDataDto[];
}

/**
 * Request DTO for updating tag data - supports multiple PIDs
 */
export class UpdateTagDataRequestDto {
  @ApiProperty({
    description: 'Array of tag data updates for multiple PIDs',
    type: [PidDataDto],
    example: [
      {
        systemId: 'SYS002',
        pid: '1',
        name: 'Tag Volume Control Parameters',
        description:
          'Updated tag-specific volume control configuration parameters',
        elements: [
          {
            type: 'ConfigElement',
            name: 'tag_volume_level',
            description: 'Tag-specific volume level setting',
            group: 'Tag Audio Controls',
            subgroup: 'Volume Settings',
            dataType: 'UInt32',
            value: '80',
            unit: 'dB',
            displayType: 'Slider',
            policy: 'Basic',
            precision: 1,
            min: '0',
            max: '100',
            validValues: [
              {value: '0', name: 'Mute'},
              {value: '20', name: 'Low'},
              {value: '50', name: 'Medium'},
              {value: '80', name: 'High'},
              {value: '100', name: 'Maximum'},
            ],
            isReadOnly: false,
          },
        ],
      },
    ],
  })
  data!: PidDataDto[];
}
