/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

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
      const result = SpfProperties.parseApmParameter(
        view,
        payload,
        pos,
        moduleList,
      );

      // Update the appropriate property based on the result
      if (result.subgraphConfig) subgraphConfig = result.subgraphConfig;
      if (result.containerConfig) containerConfig = result.containerConfig;
      if (result.moduleList) moduleList = result.moduleList;
      if (result.moduleProperties) moduleProperties = result.moduleProperties;
      if (result.dataLinks) dataLinks = result.dataLinks;
      if (result.controlLinks) controlLinks = result.controlLinks;
      if (result.vcpmConfig) vcpmConfig = result.vcpmConfig;

      pos = result.newPos;
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
   * Parse a single APM parameter from the payload
   */
  private static parseApmParameter(
    view: DataView,
    payload: Uint8Array,
    startPos: number,
    moduleList: ModuleListProperty | undefined,
  ): {
    subgraphConfig?: SubgraphConfigProperty;
    containerConfig?: ContainerConfigProperty;
    moduleList?: ModuleListProperty;
    moduleProperties?: ModulePortProperty;
    dataLinks?: DataLinksProperty;
    controlLinks?: ControlLinksProperty;
    vcpmConfig?: VcpmConfigProperty;
    newPos: number;
  } {
    let pos = startPos;

    // Read APM module ID
    SpfProperties.validateLength(
      pos,
      BinaryUtils.SIZEOF_UINT32,
      payload.length,
      'APM module ID',
    );
    pos += BinaryUtils.SIZEOF_UINT32;

    // Read APM parameter ID
    SpfProperties.validateLength(
      pos,
      BinaryUtils.SIZEOF_UINT32,
      payload.length,
      'APM parameter ID',
    );
    const apmParamId = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Read payload size
    SpfProperties.validateLength(
      pos,
      BinaryUtils.SIZEOF_UINT32,
      payload.length,
      'payload size',
    );
    const payloadSize = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Read payload data
    SpfProperties.validateLength(
      pos,
      payloadSize,
      payload.length,
      'payload data',
    );
    const payloadData = payload.slice(pos, pos + payloadSize);
    pos += payloadSize;

    // Parse based on parameter ID
    const parsedProperty = SpfProperties.parseByParameterId(
      apmParamId,
      payloadData,
      payloadSize,
      moduleList,
    );

    // Handle 8-byte alignment padding
    const paddingSize = SpfProperties.getPaddingSize(payloadSize);
    pos += paddingSize;

    return {...parsedProperty, newPos: pos};
  }

  /**
   * Validate that there are enough bytes remaining in the payload
   */
  private static validateLength(
    pos: number,
    requiredBytes: number,
    totalLength: number,
    fieldName: string,
  ): void {
    if (pos + requiredBytes > totalLength) {
      throw new Error(`Cannot read ${fieldName} at position ${pos}`);
    }
  }

  /**
   * Parse property data based on parameter ID
   */
  private static parseByParameterId(
    apmParamId: number,
    payloadData: Uint8Array,
    payloadSize: number,
    moduleList: ModuleListProperty | undefined,
  ): {
    subgraphConfig?: SubgraphConfigProperty;
    containerConfig?: ContainerConfigProperty;
    moduleList?: ModuleListProperty;
    moduleProperties?: ModulePortProperty;
    dataLinks?: DataLinksProperty;
    controlLinks?: ControlLinksProperty;
    vcpmConfig?: VcpmConfigProperty;
  } {
    switch (apmParamId) {
      case PARAM_ID_SUB_GRAPH_CONFIG:
        return {
          subgraphConfig: SubgraphConfigProperty.fromPayload(payloadData),
        };

      case PARAM_ID_CONTAINER_CONFIG:
        return {
          containerConfig: ContainerConfigProperty.fromPayload(payloadData),
        };

      case PARAM_ID_MODULES_LIST:
        return {moduleList: ModuleListProperty.fromPayload(payloadData)};

      case PARAM_ID_MODULE_PROP:
        return {
          moduleProperties: ModulePortProperty.fromPayload(payloadData),
        };

      case PARAM_ID_MODULE_DATA_LINK:
        if (payloadSize > 0) {
          const moduleInstanceIds = moduleList
            ? moduleList.moduleInstanceInfos.flatMap(info =>
                info.moduleInstances.map(instance => instance.instanceId),
              )
            : [];

          return {
            dataLinks: DataLinksProperty.fromPayload(
              payloadData,
              moduleInstanceIds,
            ),
          };
        }
        return {};

      case PARAM_ID_MODULE_CTRL_LINK:
        if (payloadSize > 0) {
          return {
            controlLinks: ControlLinksProperty.fromPayload(payloadData),
          };
        }
        return {};

      case PARAM_ID_VOICE_SG_CONFIG:
        return {vcpmConfig: VcpmConfigProperty.fromPayload(payloadData)};

      default:
        console.warn(`Unknown SPF parameter ID: 0x${apmParamId.toString(16)}`);
        return {};
    }
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
