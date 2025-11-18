import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';
import {SubgraphConfigProperty} from './subgraph-config-property.js';
import {ContainerConfigProperty} from './container-config-property.js';
import {ModuleListProperty} from './module-list-property.js';
import {ModulePortProperty} from './module-port-property.js';
import {DataLinksProperty} from './data-links-property.js';
import {ControlLinksProperty} from './control-links-property.js';
import {VcpmConfigProperty} from './vcpm-config-property.js';
import {
  PARAM_ID_SUB_GRAPH_CONFIG,
  PARAM_ID_CONTAINER_CONFIG,
  PARAM_ID_MODULES_LIST,
  PARAM_ID_MODULE_PROP,
  PARAM_ID_MODULE_DATA_LINK,
  PARAM_ID_MODULE_CTRL_LINK,
  PARAM_ID_VOICE_SG_CONFIG,
} from '../../constants/spf-ids.js';

/**
 * Main SPF Properties class that parses and contains all subgraph property data.
 * Based on C# GeckoPropertyData implementation.
 */
export class SpfProperties {
  /** Subgraph configuration properties */
  readonly subgraphConfig?: SubgraphConfigProperty;

  /** Container configuration properties */
  readonly containerConfig?: ContainerConfigProperty;

  /** Module list properties */
  readonly moduleList?: ModuleListProperty;

  /** Module port properties */
  readonly moduleProperties?: ModulePortProperty;

  /** Data links properties */
  readonly dataLinks?: DataLinksProperty;

  /** Control links properties */
  readonly controlLinks?: ControlLinksProperty;

  /** VCPM configuration properties */
  readonly vcpmConfig?: VcpmConfigProperty;

  private constructor(
    subgraphConfig?: SubgraphConfigProperty,
    containerConfig?: ContainerConfigProperty,
    moduleList?: ModuleListProperty,
    moduleProperties?: ModulePortProperty,
    dataLinks?: DataLinksProperty,
    controlLinks?: ControlLinksProperty,
    vcpmConfig?: VcpmConfigProperty,
  ) {
    this.subgraphConfig = subgraphConfig;
    this.containerConfig = containerConfig;
    this.moduleList = moduleList;
    this.moduleProperties = moduleProperties;
    this.dataLinks = dataLinks;
    this.controlLinks = controlLinks;
    this.vcpmConfig = vcpmConfig;
  }

  /**
   * Create SpfProperties from binary payload
   */
  static fromPayload(payload: Uint8Array): SpfProperties {
    const view = new DataView(
      payload.buffer,
      payload.byteOffset,
      payload.byteLength,
    );
    let pos = 0;

    let subgraphConfig: SubgraphConfigProperty | undefined;
    let containerConfig: ContainerConfigProperty | undefined;
    let moduleList: ModuleListProperty | undefined;
    let moduleProperties: ModulePortProperty | undefined;
    let dataLinks: DataLinksProperty | undefined;
    let controlLinks: ControlLinksProperty | undefined;
    let vcpmConfig: VcpmConfigProperty | undefined;

    // Parse each property section
    while (pos < payload.length) {
      // Read APM module ID
      if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
        throw new Error(`Cannot read APM module ID at position ${pos}`);
      }

      //const apmModuleId = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Read APM parameter ID
      if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
        throw new Error(`Cannot read APM parameter ID at position ${pos}`);
      }

      const apmParamId = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Read payload size
      if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
        throw new Error(`Cannot read payload size at position ${pos}`);
      }

      const payloadSize = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Read payload data
      if (pos + payloadSize > payload.length) {
        throw new Error(
          `Cannot read payload data at position ${pos}, size ${payloadSize}`,
        );
      }

      const payloadData = payload.slice(pos, pos + payloadSize);
      pos += payloadSize;

      // Parse based on parameter ID
      switch (apmParamId) {
        case PARAM_ID_SUB_GRAPH_CONFIG:
          subgraphConfig = SubgraphConfigProperty.fromPayload(payloadData);
          break;

        case PARAM_ID_CONTAINER_CONFIG:
          containerConfig = ContainerConfigProperty.fromPayload(payloadData);
          break;

        case PARAM_ID_MODULES_LIST:
          moduleList = ModuleListProperty.fromPayload(payloadData);
          break;

        case PARAM_ID_MODULE_PROP:
          moduleProperties = ModulePortProperty.fromPayload(payloadData);
          break;

        case PARAM_ID_MODULE_DATA_LINK:
          if (payloadSize > 0) {
            dataLinks = DataLinksProperty.fromPayload(payloadData);
          }
          break;

        case PARAM_ID_MODULE_CTRL_LINK:
          if (payloadSize > 0) {
            controlLinks = ControlLinksProperty.fromPayload(payloadData);
          }
          break;

        case PARAM_ID_VOICE_SG_CONFIG:
          vcpmConfig = VcpmConfigProperty.fromPayload(payloadData);
          break;

        default:
          // Unknown parameter ID - skip this section
          console.warn(
            `Unknown SPF parameter ID: 0x${apmParamId.toString(16)}`,
          );
          break;
      }

      // Handle 8-byte alignment padding
      const paddingSize = SpfProperties.getPaddingSize(payloadSize);
      pos += paddingSize;
    }

    return new SpfProperties(
      subgraphConfig,
      containerConfig,
      moduleList,
      moduleProperties,
      dataLinks,
      controlLinks,
      vcpmConfig,
    );
  }

  /**
   * Calculate padding size for 8-byte alignment
   */
  private static getPaddingSize(size: number): number {
    if (size % 8 === 0) {
      return 0;
    }
    return 8 - (size % 8);
  }

  /**
   * Check if any properties are present
   */
  hasProperties(): boolean {
    return !!(
      this.subgraphConfig ||
      this.containerConfig ||
      this.moduleList ||
      this.moduleProperties ||
      this.dataLinks ||
      this.controlLinks ||
      this.vcpmConfig
    );
  }

  /**
   * Get a summary of available properties
   */
  getPropertySummary(): {
    subgraphConfig: boolean;
    containerConfig: boolean;
    moduleList: boolean;
    moduleProperties: boolean;
    dataLinks: boolean;
    controlLinks: boolean;
    vcpmConfig: boolean;
  } {
    return {
      subgraphConfig: !!this.subgraphConfig,
      containerConfig: !!this.containerConfig,
      moduleList: !!this.moduleList,
      moduleProperties: !!this.moduleProperties,
      dataLinks: !!this.dataLinks,
      controlLinks: !!this.controlLinks,
      vcpmConfig: !!this.vcpmConfig,
    };
  }
}
