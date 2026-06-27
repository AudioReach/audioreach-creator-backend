/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {MigrationInterface, QueryRunner} from 'typeorm';

export class InitialCreate1782661700264 implements MigrationInterface {
  name = 'InitialCreate1782661700264';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "processor_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "processor_definition_id" integer NOT NULL, "name" varchar(255) NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE TABLE "container_types" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "name" varchar(255) NOT NULL, "value" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE TABLE "container_property_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "property_id" integer NOT NULL, "name" varchar(255), "description" text, "max_size" integer NOT NULL, "property_type" varchar CHECK( "property_type" IN ('SPF','DRIVER') ) NOT NULL, "elements_structure" text)`,
    );
    await queryRunner.query(
      `CREATE TABLE "arc_keys" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "file_system_id" integer NOT NULL, "key_id" integer NOT NULL, "name" text NOT NULL, "key_enum_name" text, "key_enum_value" text, "description" text, "is_voice" boolean, "is_dynamic" boolean, "is_calibration_key" boolean, "is_graph_key" boolean, "speciality_key_value" text, "calibration_enum_value" text, "graph_enum_value" text)`,
    );
    await queryRunner.query(
      `CREATE TABLE "arc_values" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "value_id" integer NOT NULL, "keys_system_id" integer NOT NULL, "name" text NOT NULL, "enum_value" text, "special_value" text, "description" text)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_arc_values_keys_system_id" ON "arc_values" ("keys_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "driver_module_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "module_definition_id" integer NOT NULL, "name" varchar(255) NOT NULL, "description" text, "group_name" varchar(255), "file_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE TABLE "driver_module_parameter_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "parameter_id" integer NOT NULL, "name" varchar(255), "description" text, "max_size" integer NOT NULL, "param_structure" text NOT NULL, "driver_module_definition_system_id" integer)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_module_param_defs_driver_module_def_id" ON "driver_module_parameter_definitions" ("driver_module_definition_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "data_port_groups" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "max_allowed_port_count" integer NOT NULL DEFAULT (0), "port_io_type" varchar CHECK( "port_io_type" IN ('INPUT','OUTPUT','INPUT_OUTPUT','OUTPUT_INPUT') ) NOT NULL, "module_definition_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_data_port_groups_module_def_id" ON "data_port_groups" ("module_definition_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "data_port_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "data_port_id" integer NOT NULL, "name" varchar(255), "data_port_group_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_data_port_definitions_group_id" ON "data_port_definitions" ("data_port_group_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "dynamic_intent_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "intent_id" integer NOT NULL, "name" varchar(255), "max_port" integer, "module_definition_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_dynamic_intent_defs_module_def_id" ON "dynamic_intent_definitions" ("module_definition_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "module_attributes" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "name" varchar(255) NOT NULL, "value" varchar(500) NOT NULL, "module_definition_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_module_attributes_module_def_id" ON "module_attributes" ("module_definition_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "module_definition_meta_data" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "value" text, "module_definition_system_id" integer NOT NULL, CONSTRAINT "REL_2118ef6e7df7c8a4005051c62a" UNIQUE ("module_definition_system_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_module_def_meta_module_def_id" ON "module_definition_meta_data" ("module_definition_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "module_parameter_attributes" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "name" varchar(255) NOT NULL, "value" text NOT NULL, "module_parameter_definition_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE TABLE "module_property_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "property_id" integer NOT NULL, "name" varchar(255), "description" text, "max_size" integer NOT NULL, "property_category_type" varchar(255), "property_structure" text NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE TABLE "spf_module_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "module_definition_id" integer NOT NULL, "name" varchar(255) NOT NULL, "display_name" varchar(255), "description" text, "group_name" varchar(255), "mod_search_keys" text, "stack_size" integer NOT NULL DEFAULT (0), "file_system_id" integer NOT NULL, "metadata" text, "is_loaded_at_bootup" boolean NOT NULL DEFAULT (0), "module_definition_system_id" integer, CONSTRAINT "REL_e5a9714fba21e5202c09bcfb7e" UNIQUE ("module_definition_system_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "spf_module_parameter_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "param_id" integer NOT NULL, "name" varchar(255), "description" text, "max_size" integer NOT NULL, "pid_type" varchar(100) NOT NULL, "is_persistent" boolean NOT NULL, "elements_structure" text, "is_read_only" boolean NOT NULL, "tool_policies" text, "spf_module_definition_system_id" integer)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_module_param_defs_spf_module_def_id" ON "spf_module_parameter_definitions" ("spf_module_definition_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "module_definition_processor_definitions" ("module_definition_system_id" integer NOT NULL, "processor_definition_system_id" integer NOT NULL, PRIMARY KEY ("module_definition_system_id", "processor_definition_system_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "module_definition_container_types" ("module_definition_system_id" integer NOT NULL, "container_type_system_id" integer NOT NULL, PRIMARY KEY ("module_definition_system_id", "container_type_system_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "static_control_port_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "port_id" integer NOT NULL, "port_name" varchar(255), "module_definition_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_static_ports_module_def_id" ON "static_control_port_definitions" ("module_definition_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "static_intent_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "intent_id" integer NOT NULL, "name" varchar(255), "static_control_port_defition_system_id" integer NOT NULL, "static_control_port_definition_system_id" integer)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_static_intent_defs_port_id" ON "static_intent_definitions" ("static_control_port_defition_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "subgraph_property_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "property_id" integer NOT NULL, "name" varchar(255), "description" text, "max_size" integer NOT NULL, "property_type" varchar CHECK( "property_type" IN ('SPF','DRIVER') ) NOT NULL, "elements_structure" text, "is_voice" boolean NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE TABLE "vcpm_module_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "module_definition_id" integer NOT NULL, "name" varchar(255) NOT NULL, "display_name" varchar(255), "description" text, "group_name" varchar(255), "file_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE TABLE "vcpm_module_parameter_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "param_id" integer NOT NULL, "name" varchar(255), "description" text, "max_size" integer NOT NULL, "pid_type" varchar(100) NOT NULL, "is_persistent" boolean NOT NULL, "is_read_only" boolean NOT NULL, "tool_policies" text, "elements_structure" text, "vcpm_module_definition_system_id" integer)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_module_param_defs_vcpm_module_def_id" ON "vcpm_module_parameter_definitions" ("vcpm_module_definition_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "tag_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "tag_id" integer NOT NULL, "name" varchar(255) NOT NULL, "description" text, "is_voice" boolean NOT NULL, "c_header_enum_name" varchar(255), "c_header_enum_value" varchar(255), "file_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE TABLE "tag_key_def_links" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "tag_definition_system_id" integer NOT NULL, "key_reference_system_id" integer NOT NULL, "tag_enum_value" text)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_tag_key_def_links_tag_def_id" ON "tag_key_def_links" ("tag_definition_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "vcpm_module_attributes" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "name" varchar(255) NOT NULL, "value" varchar(500) NOT NULL, "vcpm_module_definition_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_vcpm_module_attributes_vcpm_module_def_id" ON "vcpm_module_attributes" ("vcpm_module_definition_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "driver_modules" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "definition_system_id" integer NOT NULL, "file_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_driver_modules_definition_file_system" ON "driver_modules" ("definition_system_id", "file_system_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_driver_modules_definition_system_id_file_system_id" ON "driver_modules" ("definition_system_id", "file_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "dkv" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "driver_module_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE TABLE "dkv_parameter_payload" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "parameter_system_id" integer NOT NULL, "dkv_system_id" integer NOT NULL, "payload" blob)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_dkv_parameter_payload" ON "dkv_parameter_payload" ("dkv_system_id", "parameter_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "dkv_values" ("dkv_system_id" integer NOT NULL, "value_def_system_id" integer NOT NULL, PRIMARY KEY ("dkv_system_id", "value_def_system_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "module_manager_data" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "processor_definition_system_id" integer NOT NULL, "module_definition_system_id" integer NOT NULL, "file_system_id" integer NOT NULL, "module_type" integer NOT NULL, "interface_type" integer NOT NULL, "interface_version" integer NOT NULL, "file_name" varchar(255) NOT NULL, "tag" varchar(100) NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_module_manager_data_processor_module" ON "module_manager_data" ("processor_definition_system_id", "module_definition_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "files" ("system_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "description" text NOT NULL, "metadata" text NOT NULL, "file_name" varchar(250) NOT NULL, "isTarget" integer NOT NULL, "last_reserved_id" integer NOT NULL DEFAULT (0), "open_status" varchar(30) NOT NULL DEFAULT ('LOADING'), "data_loss_issues" text, "header_version" integer NOT NULL DEFAULT (0), "acdb_version_major" integer NOT NULL DEFAULT (0), "acdb_version_minor" integer NOT NULL DEFAULT (0), "acdb_version_revision" integer NOT NULL DEFAULT (0), "acdb_version_cpl_info" integer NOT NULL DEFAULT (0), "codec_infos" text NOT NULL DEFAULT ('[]'), "modified_date" integer NOT NULL DEFAULT (0), "oem_info" text NOT NULL DEFAULT (''), "project_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_files_project_filename" ON "files" ("project_system_id", "file_name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "projects" ("system_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "name" varchar(256) NOT NULL, "description" text NOT NULL, "type" varchar(64) NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_projects_name" ON "projects" ("name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "configuration" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "file_system_id" integer NOT NULL, "port_strategy" varchar CHECK( "port_strategy" IN ('INPUT_ODD_OUTPUT_EVEN','SEQUENTIAL') ) NOT NULL, "extra_config" text)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_configuration_file" ON "configuration" ("file_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "container_property_data" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "container_system_id" integer NOT NULL, "property_system_id" integer NOT NULL, "payload" blob NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_container_property_data" ON "container_property_data" ("container_system_id", "property_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "containers" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "type" varchar(128) NOT NULL, "container_id" integer NOT NULL, "file_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_containers_container_id_file_system_id" ON "containers" ("container_id", "file_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "control_links" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "file_system_id" integer NOT NULL, "peer_nodeA_system_id" integer NOT NULL, "peer_nodeB_system_id" integer NOT NULL, "nodeA_port_system_id" integer NOT NULL, "nodeB_port_system_id" integer NOT NULL, "heap_id" integer NOT NULL, "link_type" varchar CHECK( "link_type" IN ('INTRA_SUBGRAPH','INTRA_USECASE','INTER_USECASE') ) NOT NULL, "source_subgraph_system_id" integer NOT NULL, "dest_subgraph_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_control_link_unique" ON "control_links" ("peer_nodeA_system_id", "peer_nodeB_system_id", "nodeA_port_system_id", "nodeB_port_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_control_links_src_sg_scope" ON "control_links" ("source_subgraph_system_id", "link_type") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_control_links_dst_sg" ON "control_links" ("dest_subgraph_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "data_links" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "source_node_system_id" integer NOT NULL, "destination_node_system_id" integer NOT NULL, "source_port_system_id" integer NOT NULL, "destination_port_system_id" integer NOT NULL, "link_type" varchar CHECK( "link_type" IN ('INTRA_SUBGRAPH','INTRA_USECASE','INTER_USECASE') ) NOT NULL, "source_subgraph_system_id" integer NOT NULL, "dest_subgraph_system_id" integer NOT NULL, "is_ec" integer, "file_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_data_link_ports" ON "data_links" ("source_port_system_id", "destination_port_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_data_links_src_sg_scope" ON "data_links" ("source_subgraph_system_id", "link_type") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_data_links_dst_sg" ON "data_links" ("dest_subgraph_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "subsystem_data_links" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "source_node_system_id" integer NOT NULL, "destination_node_system_id" integer NOT NULL, "source_port_system_id" integer NOT NULL, "destination_port_system_id" integer NOT NULL, "data_link_system_id" integer NOT NULL, "file_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sls_file" ON "subsystem_data_links" ("file_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sls_data_link" ON "subsystem_data_links" ("data_link_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sls_src_port_file" ON "subsystem_data_links" ("source_port_system_id", "file_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sls_dst_port_file" ON "subsystem_data_links" ("destination_port_system_id", "file_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "ckv" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "spf_module_system_id" integer NOT NULL, "ui_persistence" blob)`,
    );
    await queryRunner.query(
      `CREATE TABLE "ckv_parameter_payload" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "parameter_system_id" integer NOT NULL, "ckv_system_id" integer NOT NULL, "payload" blob NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ix_ckv_parameter" ON "ckv_parameter_payload" ("ckv_system_id", "parameter_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "ckv_values" ("ckv_system_id" integer NOT NULL, "value_def_system_id" integer NOT NULL, PRIMARY KEY ("ckv_system_id", "value_def_system_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "spf_module_properties_data" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "module_system_id" integer NOT NULL, "property_system_id" integer NOT NULL, "payload" blob NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_spf_module_properties_data" ON "spf_module_properties_data" ("module_system_id", "property_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "module_tag_id_map" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "spf_module_system_id" integer NOT NULL, "tag_definition_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ix_module_tag_definition" ON "module_tag_id_map" ("spf_module_system_id", "tag_definition_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "tkv" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "module_tag_id_map_system_id" integer NOT NULL, "ui_persistence" blob)`,
    );
    await queryRunner.query(
      `CREATE TABLE "tkv_parameter_payload" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "parameter_system_id" integer NOT NULL, "tkv_system_id" integer NOT NULL, "payload" blob NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ix_tkv_parameter" ON "tkv_parameter_payload" ("tkv_system_id", "parameter_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "tkv_values" ("tkv_system_id" integer NOT NULL, "value_def_system_id" integer NOT NULL, PRIMARY KEY ("tkv_system_id", "value_def_system_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "spf_modules" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "instance_id" integer NOT NULL, "alias" varchar(256) NOT NULL, "subgraph_system_id" integer NOT NULL, "container_system_id" integer NOT NULL, "definition_system_id" integer NOT NULL, "file_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_spf_modules_subgraph_file_system" ON "spf_modules" ("subgraph_system_id", "file_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_spf_modules_container_file_system" ON "spf_modules" ("container_system_id", "file_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_spf_modules_definition_file_system" ON "spf_modules" ("definition_system_id", "file_system_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_spf_modules_instance_id_file_system_id" ON "spf_modules" ("instance_id", "file_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "control_ports" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "port_id" integer NOT NULL, "name" varchar(255), "is_static" boolean NOT NULL, "node_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_control_port_node_port" ON "control_ports" ("node_system_id", "port_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "intents" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "intent_id" integer NOT NULL, "control_port_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_intent_control_port_intent" ON "intents" ("control_port_system_id", "intent_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "data_ports" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "data_port_id" integer NOT NULL, "name" varchar(255), "port_io_type" varchar CHECK( "port_io_type" IN ('INPUT','OUTPUT','INPUT_OUTPUT','OUTPUT_INPUT') ) NOT NULL, "is_static" boolean NOT NULL, "node_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE TABLE "nodes" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "parent_id" integer, "type" varchar CHECK( "type" IN ('module','subsystem') ) NOT NULL, "file_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE TABLE "subgraph_property_data" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "subgraph_system_id" integer NOT NULL, "subgraph_property_system_id" integer NOT NULL, "payload" blob NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_subgraph_property_data" ON "subgraph_property_data" ("subgraph_system_id", "subgraph_property_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "vcpm_instances" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "subgraph_system_id" integer NOT NULL, "vcpm_definition_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_vcpm_instance_subgraph_definition" ON "vcpm_instances" ("subgraph_system_id", "vcpm_definition_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "vcpm_ckv" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "vcpm_instance_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE TABLE "vcpm_parameter_payload" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "vcpm_parameter_system_id" integer NOT NULL, "vcpm_ckv_system_id" integer NOT NULL, "payload" blob NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_vcpm_parameter_payload" ON "vcpm_parameter_payload" ("vcpm_parameter_system_id", "vcpm_ckv_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "vcpm_ckv_values" ("vcpm_ckv_system_id" integer NOT NULL, "value_def_system_id" integer NOT NULL, PRIMARY KEY ("vcpm_ckv_system_id", "value_def_system_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "subgraphs" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "name" varchar(256) NOT NULL, "subgraph_id" integer NOT NULL, "is_exported" integer NOT NULL, "file_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_subgraphs_name_file_system_id" ON "subgraphs" ("name", "file_system_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_subgraphs_subgraph_id_file_system_id" ON "subgraphs" ("subgraph_id", "file_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "sgkv" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "subgraph_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE TABLE "sgkv_values" ("sgkv_system_id" integer NOT NULL, "value_def_system_id" integer NOT NULL, PRIMARY KEY ("sgkv_system_id", "value_def_system_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "subsystems" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "name" varchar(255) NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE TABLE "use_cases" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "alias_id" integer NOT NULL, "alias" varchar(255) NOT NULL, "file_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_use_case_alias" ON "use_cases" ("alias_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_use_case_file" ON "use_cases" ("file_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "use_case_categories_master" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "name" varchar(255) NOT NULL, CONSTRAINT "UQ_80233ed2a392151aa4f419b079e" UNIQUE ("name"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "usecase_gkv_values" ("usecase_system_id" integer NOT NULL, "value_def_system_id" integer NOT NULL, PRIMARY KEY ("usecase_system_id", "value_def_system_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "use_case_subgraphs" ("usecase_system_id" integer NOT NULL, "subgraph_system_id" integer NOT NULL, PRIMARY KEY ("usecase_system_id", "subgraph_system_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_use_case_subgraphs_subgraph" ON "use_case_subgraphs" ("subgraph_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "use_case_subgraph_pairs" ("usecase_system_id" integer NOT NULL, "source_subgraph_system_id" integer NOT NULL, "dest_subgraph_system_id" integer NOT NULL, PRIMARY KEY ("usecase_system_id", "source_subgraph_system_id", "dest_subgraph_system_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_use_case_subgraph_pairs_sgs" ON "use_case_subgraph_pairs" ("source_subgraph_system_id", "dest_subgraph_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "edit_actions" ("change_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "system_id" integer NOT NULL, "aggregate_id" integer NOT NULL DEFAULT (0), "session_id" integer NOT NULL, "table_name" varchar(100) NOT NULL, "operation" varchar CHECK( "operation" IN ('NONE','CREATE','UPDATE','DELETE') ) NOT NULL, "payload" text NOT NULL, "change_status" varchar CHECK( "change_status" IN ('STAGED','UNSTAGED') ) NOT NULL DEFAULT ('STAGED'), "base_version" integer, "group_id" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "valid_until" datetime)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_edit_actions_session" ON "edit_actions" ("session_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_edit_actions_entity_active" ON "edit_actions" ("session_id", "system_id") WHERE "valid_until" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_edit_actions_table_active" ON "edit_actions" ("session_id", "table_name") WHERE "valid_until" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_edit_actions_agg_active" ON "edit_actions" ("session_id", "aggregate_id") WHERE "valid_until" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_edit_actions_status_active" ON "edit_actions" ("session_id", "change_status") WHERE "valid_until" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uniq_edit_actions_current" ON "edit_actions" ("session_id", "system_id") WHERE "valid_until" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "restore_points" ("system_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "session_id" integer, "file_system_id" integer NOT NULL, "restore_type" varchar CHECK( "restore_type" IN ('EDIT_SNAPSHOT','FULL_SNAPSHOT') ) NOT NULL, "snapshot_data" text NOT NULL, "description" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_restore_points_session" ON "restore_points" ("session_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_restore_points_file" ON "restore_points" ("file_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "project_sessions" ("session_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "file_system_id" integer NOT NULL, "user_id" varchar(255), "client_id" varchar(255) NOT NULL, "session_mode" varchar CHECK( "session_mode" IN ('TUNING','DESIGNER','DISCOVERY_WIZARD','DIFF_MERGE') ) NOT NULL, "status" varchar CHECK( "status" IN ('ACTIVE','ENDED') ) NOT NULL DEFAULT ('ACTIVE'), "started_at" datetime NOT NULL DEFAULT (datetime('now')), "ended_at" datetime)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_project_sessions_file" ON "project_sessions" ("file_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_project_sessions_status" ON "project_sessions" ("status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_project_sessions_one_active_per_file" ON "project_sessions" ("file_system_id") WHERE status = 'ACTIVE'`,
    );
    await queryRunner.query(
      `CREATE TABLE "session_commits" ("commit_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "session_id" integer NOT NULL, "commit_message" text NOT NULL, "committed_at" datetime NOT NULL DEFAULT (datetime('now')), "change_count" integer NOT NULL DEFAULT (0))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_session_commits_session" ON "session_commits" ("session_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "validation_preferences" ("file_system_id" integer PRIMARY KEY NOT NULL, "preferences" text NOT NULL DEFAULT ('{"overrides":{},"suppressions":{}}'), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE TABLE "use_case_categories" ("use_case_system_id" integer NOT NULL, "category_system_id" integer NOT NULL, PRIMARY KEY ("use_case_system_id", "category_system_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d5b97ccc404cecb9166a453280" ON "use_case_categories" ("use_case_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_06f2962641e6632eb9a7ac63da" ON "use_case_categories" ("category_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_65e66135d222dfa6dc5fe528e6" ON "use_case_subgraphs" ("usecase_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_943c72ed8170978a8c8402bdc1" ON "use_case_subgraphs" ("subgraph_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_arc_keys" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "file_system_id" integer NOT NULL, "key_id" integer NOT NULL, "name" text NOT NULL, "key_enum_name" text, "key_enum_value" text, "description" text, "is_voice" boolean, "is_dynamic" boolean, "is_calibration_key" boolean, "is_graph_key" boolean, "speciality_key_value" text, "calibration_enum_value" text, "graph_enum_value" text, CONSTRAINT "FK_d236cb5f4166104e54da9a1d885" FOREIGN KEY ("file_system_id") REFERENCES "files" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_arc_keys"("system_id", "created_at", "updated_at", "version", "file_system_id", "key_id", "name", "key_enum_name", "key_enum_value", "description", "is_voice", "is_dynamic", "is_calibration_key", "is_graph_key", "speciality_key_value", "calibration_enum_value", "graph_enum_value") SELECT "system_id", "created_at", "updated_at", "version", "file_system_id", "key_id", "name", "key_enum_name", "key_enum_value", "description", "is_voice", "is_dynamic", "is_calibration_key", "is_graph_key", "speciality_key_value", "calibration_enum_value", "graph_enum_value" FROM "arc_keys"`,
    );
    await queryRunner.query(`DROP TABLE "arc_keys"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_arc_keys" RENAME TO "arc_keys"`,
    );
    await queryRunner.query(`DROP INDEX "idx_arc_values_keys_system_id"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_arc_values" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "value_id" integer NOT NULL, "keys_system_id" integer NOT NULL, "name" text NOT NULL, "enum_value" text, "special_value" text, "description" text, CONSTRAINT "FK_e372628e5702ae760d317b5cb7e" FOREIGN KEY ("keys_system_id") REFERENCES "arc_keys" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_arc_values"("system_id", "created_at", "updated_at", "version", "value_id", "keys_system_id", "name", "enum_value", "special_value", "description") SELECT "system_id", "created_at", "updated_at", "version", "value_id", "keys_system_id", "name", "enum_value", "special_value", "description" FROM "arc_values"`,
    );
    await queryRunner.query(`DROP TABLE "arc_values"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_arc_values" RENAME TO "arc_values"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_arc_values_keys_system_id" ON "arc_values" ("keys_system_id") `,
    );
    await queryRunner.query(
      `DROP INDEX "idx_module_param_defs_driver_module_def_id"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_driver_module_parameter_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "parameter_id" integer NOT NULL, "name" varchar(255), "description" text, "max_size" integer NOT NULL, "param_structure" text NOT NULL, "driver_module_definition_system_id" integer, CONSTRAINT "FK_7bd56233a099d7f9cc447b54ee5" FOREIGN KEY ("driver_module_definition_system_id") REFERENCES "driver_module_definitions" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_driver_module_parameter_definitions"("system_id", "created_at", "updated_at", "version", "parameter_id", "name", "description", "max_size", "param_structure", "driver_module_definition_system_id") SELECT "system_id", "created_at", "updated_at", "version", "parameter_id", "name", "description", "max_size", "param_structure", "driver_module_definition_system_id" FROM "driver_module_parameter_definitions"`,
    );
    await queryRunner.query(`DROP TABLE "driver_module_parameter_definitions"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_driver_module_parameter_definitions" RENAME TO "driver_module_parameter_definitions"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_module_param_defs_driver_module_def_id" ON "driver_module_parameter_definitions" ("driver_module_definition_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "idx_data_port_groups_module_def_id"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_data_port_groups" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "max_allowed_port_count" integer NOT NULL DEFAULT (0), "port_io_type" varchar CHECK( "port_io_type" IN ('INPUT','OUTPUT','INPUT_OUTPUT','OUTPUT_INPUT') ) NOT NULL, "module_definition_system_id" integer NOT NULL, CONSTRAINT "FK_abc032c4c82f928b76c026cb6ec" FOREIGN KEY ("module_definition_system_id") REFERENCES "spf_module_definitions" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_data_port_groups"("system_id", "created_at", "updated_at", "version", "max_allowed_port_count", "port_io_type", "module_definition_system_id") SELECT "system_id", "created_at", "updated_at", "version", "max_allowed_port_count", "port_io_type", "module_definition_system_id" FROM "data_port_groups"`,
    );
    await queryRunner.query(`DROP TABLE "data_port_groups"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_data_port_groups" RENAME TO "data_port_groups"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_data_port_groups_module_def_id" ON "data_port_groups" ("module_definition_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "idx_data_port_definitions_group_id"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_data_port_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "data_port_id" integer NOT NULL, "name" varchar(255), "data_port_group_system_id" integer NOT NULL, CONSTRAINT "FK_370b20d586b7fe81de2fc692249" FOREIGN KEY ("data_port_group_system_id") REFERENCES "data_port_groups" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_data_port_definitions"("system_id", "created_at", "updated_at", "version", "data_port_id", "name", "data_port_group_system_id") SELECT "system_id", "created_at", "updated_at", "version", "data_port_id", "name", "data_port_group_system_id" FROM "data_port_definitions"`,
    );
    await queryRunner.query(`DROP TABLE "data_port_definitions"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_data_port_definitions" RENAME TO "data_port_definitions"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_data_port_definitions_group_id" ON "data_port_definitions" ("data_port_group_system_id") `,
    );
    await queryRunner.query(
      `DROP INDEX "idx_dynamic_intent_defs_module_def_id"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_dynamic_intent_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "intent_id" integer NOT NULL, "name" varchar(255), "max_port" integer, "module_definition_system_id" integer NOT NULL, CONSTRAINT "FK_17905ef364ca47221c3be3535ce" FOREIGN KEY ("module_definition_system_id") REFERENCES "spf_module_definitions" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_dynamic_intent_definitions"("system_id", "created_at", "updated_at", "version", "intent_id", "name", "max_port", "module_definition_system_id") SELECT "system_id", "created_at", "updated_at", "version", "intent_id", "name", "max_port", "module_definition_system_id" FROM "dynamic_intent_definitions"`,
    );
    await queryRunner.query(`DROP TABLE "dynamic_intent_definitions"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_dynamic_intent_definitions" RENAME TO "dynamic_intent_definitions"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_dynamic_intent_defs_module_def_id" ON "dynamic_intent_definitions" ("module_definition_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "idx_module_attributes_module_def_id"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_module_attributes" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "name" varchar(255) NOT NULL, "value" varchar(500) NOT NULL, "module_definition_system_id" integer NOT NULL, CONSTRAINT "FK_bd8675df582357c9eb5ac447a57" FOREIGN KEY ("module_definition_system_id") REFERENCES "spf_module_definitions" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_module_attributes"("system_id", "created_at", "updated_at", "version", "name", "value", "module_definition_system_id") SELECT "system_id", "created_at", "updated_at", "version", "name", "value", "module_definition_system_id" FROM "module_attributes"`,
    );
    await queryRunner.query(`DROP TABLE "module_attributes"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_module_attributes" RENAME TO "module_attributes"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_module_attributes_module_def_id" ON "module_attributes" ("module_definition_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "idx_module_def_meta_module_def_id"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_module_definition_meta_data" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "value" text, "module_definition_system_id" integer NOT NULL, CONSTRAINT "REL_2118ef6e7df7c8a4005051c62a" UNIQUE ("module_definition_system_id"), CONSTRAINT "FK_2118ef6e7df7c8a4005051c62ac" FOREIGN KEY ("module_definition_system_id") REFERENCES "spf_module_definitions" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_module_definition_meta_data"("system_id", "created_at", "updated_at", "version", "value", "module_definition_system_id") SELECT "system_id", "created_at", "updated_at", "version", "value", "module_definition_system_id" FROM "module_definition_meta_data"`,
    );
    await queryRunner.query(`DROP TABLE "module_definition_meta_data"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_module_definition_meta_data" RENAME TO "module_definition_meta_data"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_module_def_meta_module_def_id" ON "module_definition_meta_data" ("module_definition_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_module_parameter_attributes" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "name" varchar(255) NOT NULL, "value" text NOT NULL, "module_parameter_definition_system_id" integer NOT NULL, CONSTRAINT "FK_1ed8eb4b899c8e2530990d759a6" FOREIGN KEY ("module_parameter_definition_system_id") REFERENCES "spf_module_parameter_definitions" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_module_parameter_attributes"("system_id", "created_at", "updated_at", "version", "name", "value", "module_parameter_definition_system_id") SELECT "system_id", "created_at", "updated_at", "version", "name", "value", "module_parameter_definition_system_id" FROM "module_parameter_attributes"`,
    );
    await queryRunner.query(`DROP TABLE "module_parameter_attributes"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_module_parameter_attributes" RENAME TO "module_parameter_attributes"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_spf_module_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "module_definition_id" integer NOT NULL, "name" varchar(255) NOT NULL, "display_name" varchar(255), "description" text, "group_name" varchar(255), "mod_search_keys" text, "stack_size" integer NOT NULL DEFAULT (0), "file_system_id" integer NOT NULL, "metadata" text, "is_loaded_at_bootup" boolean NOT NULL DEFAULT (0), "module_definition_system_id" integer, CONSTRAINT "REL_e5a9714fba21e5202c09bcfb7e" UNIQUE ("module_definition_system_id"), CONSTRAINT "FK_e5a9714fba21e5202c09bcfb7e4" FOREIGN KEY ("module_definition_system_id") REFERENCES "module_definition_meta_data" ("system_id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_spf_module_definitions"("system_id", "created_at", "updated_at", "version", "module_definition_id", "name", "display_name", "description", "group_name", "mod_search_keys", "stack_size", "file_system_id", "metadata", "is_loaded_at_bootup", "module_definition_system_id") SELECT "system_id", "created_at", "updated_at", "version", "module_definition_id", "name", "display_name", "description", "group_name", "mod_search_keys", "stack_size", "file_system_id", "metadata", "is_loaded_at_bootup", "module_definition_system_id" FROM "spf_module_definitions"`,
    );
    await queryRunner.query(`DROP TABLE "spf_module_definitions"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_spf_module_definitions" RENAME TO "spf_module_definitions"`,
    );
    await queryRunner.query(
      `DROP INDEX "idx_module_param_defs_spf_module_def_id"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_spf_module_parameter_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "param_id" integer NOT NULL, "name" varchar(255), "description" text, "max_size" integer NOT NULL, "pid_type" varchar(100) NOT NULL, "is_persistent" boolean NOT NULL, "elements_structure" text, "is_read_only" boolean NOT NULL, "tool_policies" text, "spf_module_definition_system_id" integer, CONSTRAINT "FK_ef02bfa739e94a283a1726b2d22" FOREIGN KEY ("spf_module_definition_system_id") REFERENCES "spf_module_definitions" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_spf_module_parameter_definitions"("system_id", "created_at", "updated_at", "version", "param_id", "name", "description", "max_size", "pid_type", "is_persistent", "elements_structure", "is_read_only", "tool_policies", "spf_module_definition_system_id") SELECT "system_id", "created_at", "updated_at", "version", "param_id", "name", "description", "max_size", "pid_type", "is_persistent", "elements_structure", "is_read_only", "tool_policies", "spf_module_definition_system_id" FROM "spf_module_parameter_definitions"`,
    );
    await queryRunner.query(`DROP TABLE "spf_module_parameter_definitions"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_spf_module_parameter_definitions" RENAME TO "spf_module_parameter_definitions"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_module_param_defs_spf_module_def_id" ON "spf_module_parameter_definitions" ("spf_module_definition_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_module_definition_processor_definitions" ("module_definition_system_id" integer NOT NULL, "processor_definition_system_id" integer NOT NULL, CONSTRAINT "FK_63cb55edb521f1ac33b38f5ed78" FOREIGN KEY ("module_definition_system_id") REFERENCES "spf_module_definitions" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_24dd3554a74f2464253b28b3dc7" FOREIGN KEY ("processor_definition_system_id") REFERENCES "processor_definitions" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, PRIMARY KEY ("module_definition_system_id", "processor_definition_system_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_module_definition_processor_definitions"("module_definition_system_id", "processor_definition_system_id") SELECT "module_definition_system_id", "processor_definition_system_id" FROM "module_definition_processor_definitions"`,
    );
    await queryRunner.query(
      `DROP TABLE "module_definition_processor_definitions"`,
    );
    await queryRunner.query(
      `ALTER TABLE "temporary_module_definition_processor_definitions" RENAME TO "module_definition_processor_definitions"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_module_definition_container_types" ("module_definition_system_id" integer NOT NULL, "container_type_system_id" integer NOT NULL, CONSTRAINT "FK_2251eba25dae5c3f257a28afc8a" FOREIGN KEY ("module_definition_system_id") REFERENCES "spf_module_definitions" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_f2baee0206ea8f0f46ae3077aa4" FOREIGN KEY ("container_type_system_id") REFERENCES "container_types" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, PRIMARY KEY ("module_definition_system_id", "container_type_system_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_module_definition_container_types"("module_definition_system_id", "container_type_system_id") SELECT "module_definition_system_id", "container_type_system_id" FROM "module_definition_container_types"`,
    );
    await queryRunner.query(`DROP TABLE "module_definition_container_types"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_module_definition_container_types" RENAME TO "module_definition_container_types"`,
    );
    await queryRunner.query(`DROP INDEX "idx_static_ports_module_def_id"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_static_control_port_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "port_id" integer NOT NULL, "port_name" varchar(255), "module_definition_system_id" integer NOT NULL, CONSTRAINT "FK_7ea40124dd5ed75a44da71268c9" FOREIGN KEY ("module_definition_system_id") REFERENCES "spf_module_definitions" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_static_control_port_definitions"("system_id", "created_at", "updated_at", "version", "port_id", "port_name", "module_definition_system_id") SELECT "system_id", "created_at", "updated_at", "version", "port_id", "port_name", "module_definition_system_id" FROM "static_control_port_definitions"`,
    );
    await queryRunner.query(`DROP TABLE "static_control_port_definitions"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_static_control_port_definitions" RENAME TO "static_control_port_definitions"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_static_ports_module_def_id" ON "static_control_port_definitions" ("module_definition_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "idx_static_intent_defs_port_id"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_static_intent_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "intent_id" integer NOT NULL, "name" varchar(255), "static_control_port_defition_system_id" integer NOT NULL, "static_control_port_definition_system_id" integer, CONSTRAINT "FK_ec3390b2d1cf73e8b8158d9b690" FOREIGN KEY ("static_control_port_definition_system_id") REFERENCES "static_control_port_definitions" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_static_intent_definitions"("system_id", "created_at", "updated_at", "version", "intent_id", "name", "static_control_port_defition_system_id", "static_control_port_definition_system_id") SELECT "system_id", "created_at", "updated_at", "version", "intent_id", "name", "static_control_port_defition_system_id", "static_control_port_definition_system_id" FROM "static_intent_definitions"`,
    );
    await queryRunner.query(`DROP TABLE "static_intent_definitions"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_static_intent_definitions" RENAME TO "static_intent_definitions"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_static_intent_defs_port_id" ON "static_intent_definitions" ("static_control_port_defition_system_id") `,
    );
    await queryRunner.query(
      `DROP INDEX "idx_module_param_defs_vcpm_module_def_id"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_vcpm_module_parameter_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "param_id" integer NOT NULL, "name" varchar(255), "description" text, "max_size" integer NOT NULL, "pid_type" varchar(100) NOT NULL, "is_persistent" boolean NOT NULL, "is_read_only" boolean NOT NULL, "tool_policies" text, "elements_structure" text, "vcpm_module_definition_system_id" integer, CONSTRAINT "FK_5b700b594556357857f7f1c7822" FOREIGN KEY ("vcpm_module_definition_system_id") REFERENCES "vcpm_module_definitions" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_vcpm_module_parameter_definitions"("system_id", "created_at", "updated_at", "version", "param_id", "name", "description", "max_size", "pid_type", "is_persistent", "is_read_only", "tool_policies", "elements_structure", "vcpm_module_definition_system_id") SELECT "system_id", "created_at", "updated_at", "version", "param_id", "name", "description", "max_size", "pid_type", "is_persistent", "is_read_only", "tool_policies", "elements_structure", "vcpm_module_definition_system_id" FROM "vcpm_module_parameter_definitions"`,
    );
    await queryRunner.query(`DROP TABLE "vcpm_module_parameter_definitions"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_vcpm_module_parameter_definitions" RENAME TO "vcpm_module_parameter_definitions"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_module_param_defs_vcpm_module_def_id" ON "vcpm_module_parameter_definitions" ("vcpm_module_definition_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "idx_tag_key_def_links_tag_def_id"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_tag_key_def_links" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "tag_definition_system_id" integer NOT NULL, "key_reference_system_id" integer NOT NULL, "tag_enum_value" text, CONSTRAINT "FK_4bca74114e360dc36ca8ad15db8" FOREIGN KEY ("tag_definition_system_id") REFERENCES "tag_definitions" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_tag_key_def_links"("system_id", "created_at", "updated_at", "version", "tag_definition_system_id", "key_reference_system_id", "tag_enum_value") SELECT "system_id", "created_at", "updated_at", "version", "tag_definition_system_id", "key_reference_system_id", "tag_enum_value" FROM "tag_key_def_links"`,
    );
    await queryRunner.query(`DROP TABLE "tag_key_def_links"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_tag_key_def_links" RENAME TO "tag_key_def_links"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_tag_key_def_links_tag_def_id" ON "tag_key_def_links" ("tag_definition_system_id") `,
    );
    await queryRunner.query(
      `DROP INDEX "idx_vcpm_module_attributes_vcpm_module_def_id"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_vcpm_module_attributes" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "name" varchar(255) NOT NULL, "value" varchar(500) NOT NULL, "vcpm_module_definition_system_id" integer NOT NULL, CONSTRAINT "FK_d596f3b826c88f6e00b30990df2" FOREIGN KEY ("vcpm_module_definition_system_id") REFERENCES "vcpm_module_definitions" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_vcpm_module_attributes"("system_id", "created_at", "updated_at", "version", "name", "value", "vcpm_module_definition_system_id") SELECT "system_id", "created_at", "updated_at", "version", "name", "value", "vcpm_module_definition_system_id" FROM "vcpm_module_attributes"`,
    );
    await queryRunner.query(`DROP TABLE "vcpm_module_attributes"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_vcpm_module_attributes" RENAME TO "vcpm_module_attributes"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_vcpm_module_attributes_vcpm_module_def_id" ON "vcpm_module_attributes" ("vcpm_module_definition_system_id") `,
    );
    await queryRunner.query(
      `DROP INDEX "ix_driver_modules_definition_file_system"`,
    );
    await queryRunner.query(
      `DROP INDEX "uq_driver_modules_definition_system_id_file_system_id"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_driver_modules" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "definition_system_id" integer NOT NULL, "file_system_id" integer NOT NULL, CONSTRAINT "FK_7bb93d599ab6ec0f630341ee7b2" FOREIGN KEY ("definition_system_id") REFERENCES "driver_module_definitions" ("system_id") ON DELETE RESTRICT ON UPDATE NO ACTION, CONSTRAINT "FK_17be618ad63aaa3eba8fa69c9d4" FOREIGN KEY ("file_system_id") REFERENCES "files" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_driver_modules"("system_id", "created_at", "updated_at", "version", "definition_system_id", "file_system_id") SELECT "system_id", "created_at", "updated_at", "version", "definition_system_id", "file_system_id" FROM "driver_modules"`,
    );
    await queryRunner.query(`DROP TABLE "driver_modules"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_driver_modules" RENAME TO "driver_modules"`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_driver_modules_definition_file_system" ON "driver_modules" ("definition_system_id", "file_system_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_driver_modules_definition_system_id_file_system_id" ON "driver_modules" ("definition_system_id", "file_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_dkv" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "driver_module_system_id" integer NOT NULL, CONSTRAINT "FK_543f55c03493f970b195144effc" FOREIGN KEY ("driver_module_system_id") REFERENCES "driver_modules" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_dkv"("system_id", "created_at", "updated_at", "version", "driver_module_system_id") SELECT "system_id", "created_at", "updated_at", "version", "driver_module_system_id" FROM "dkv"`,
    );
    await queryRunner.query(`DROP TABLE "dkv"`);
    await queryRunner.query(`ALTER TABLE "temporary_dkv" RENAME TO "dkv"`);
    await queryRunner.query(`DROP INDEX "uk_dkv_parameter_payload"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_dkv_parameter_payload" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "parameter_system_id" integer NOT NULL, "dkv_system_id" integer NOT NULL, "payload" blob, CONSTRAINT "FK_237ae09fc03ebfae2588d3264c0" FOREIGN KEY ("dkv_system_id") REFERENCES "dkv" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_30bdf237a3670f9d9d23fe5c9f2" FOREIGN KEY ("parameter_system_id") REFERENCES "driver_module_parameter_definitions" ("system_id") ON DELETE RESTRICT ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_dkv_parameter_payload"("system_id", "created_at", "updated_at", "version", "parameter_system_id", "dkv_system_id", "payload") SELECT "system_id", "created_at", "updated_at", "version", "parameter_system_id", "dkv_system_id", "payload" FROM "dkv_parameter_payload"`,
    );
    await queryRunner.query(`DROP TABLE "dkv_parameter_payload"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_dkv_parameter_payload" RENAME TO "dkv_parameter_payload"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_dkv_parameter_payload" ON "dkv_parameter_payload" ("dkv_system_id", "parameter_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_dkv_values" ("dkv_system_id" integer NOT NULL, "value_def_system_id" integer NOT NULL, CONSTRAINT "FK_d57bafa80990849c5ccc48c2301" FOREIGN KEY ("dkv_system_id") REFERENCES "dkv" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_1a5cedb797e44c753b295134f3e" FOREIGN KEY ("value_def_system_id") REFERENCES "arc_values" ("system_id") ON DELETE RESTRICT ON UPDATE NO ACTION, PRIMARY KEY ("dkv_system_id", "value_def_system_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_dkv_values"("dkv_system_id", "value_def_system_id") SELECT "dkv_system_id", "value_def_system_id" FROM "dkv_values"`,
    );
    await queryRunner.query(`DROP TABLE "dkv_values"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_dkv_values" RENAME TO "dkv_values"`,
    );
    await queryRunner.query(
      `DROP INDEX "uq_module_manager_data_processor_module"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_module_manager_data" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "processor_definition_system_id" integer NOT NULL, "module_definition_system_id" integer NOT NULL, "file_system_id" integer NOT NULL, "module_type" integer NOT NULL, "interface_type" integer NOT NULL, "interface_version" integer NOT NULL, "file_name" varchar(255) NOT NULL, "tag" varchar(100) NOT NULL, CONSTRAINT "FK_16d3552d3f1810b0d9dc0529424" FOREIGN KEY ("processor_definition_system_id") REFERENCES "processor_definitions" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_23079924ee5fc577f8dc41a3f40" FOREIGN KEY ("module_definition_system_id") REFERENCES "spf_module_definitions" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_156ab77b7fb89e4e5a421beb01e" FOREIGN KEY ("file_system_id") REFERENCES "files" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_module_manager_data"("system_id", "created_at", "updated_at", "version", "processor_definition_system_id", "module_definition_system_id", "file_system_id", "module_type", "interface_type", "interface_version", "file_name", "tag") SELECT "system_id", "created_at", "updated_at", "version", "processor_definition_system_id", "module_definition_system_id", "file_system_id", "module_type", "interface_type", "interface_version", "file_name", "tag" FROM "module_manager_data"`,
    );
    await queryRunner.query(`DROP TABLE "module_manager_data"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_module_manager_data" RENAME TO "module_manager_data"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_module_manager_data_processor_module" ON "module_manager_data" ("processor_definition_system_id", "module_definition_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "uk_files_project_filename"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_files" ("system_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "description" text NOT NULL, "metadata" text NOT NULL, "file_name" varchar(250) NOT NULL, "isTarget" integer NOT NULL, "last_reserved_id" integer NOT NULL DEFAULT (0), "open_status" varchar(30) NOT NULL DEFAULT ('LOADING'), "data_loss_issues" text, "header_version" integer NOT NULL DEFAULT (0), "acdb_version_major" integer NOT NULL DEFAULT (0), "acdb_version_minor" integer NOT NULL DEFAULT (0), "acdb_version_revision" integer NOT NULL DEFAULT (0), "acdb_version_cpl_info" integer NOT NULL DEFAULT (0), "codec_infos" text NOT NULL DEFAULT ('[]'), "modified_date" integer NOT NULL DEFAULT (0), "oem_info" text NOT NULL DEFAULT (''), "project_system_id" integer NOT NULL, CONSTRAINT "FK_aac4841c3940d3251cc25b6c3be" FOREIGN KEY ("project_system_id") REFERENCES "projects" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_files"("system_id", "created_at", "updated_at", "version", "description", "metadata", "file_name", "isTarget", "last_reserved_id", "open_status", "data_loss_issues", "header_version", "acdb_version_major", "acdb_version_minor", "acdb_version_revision", "acdb_version_cpl_info", "codec_infos", "modified_date", "oem_info", "project_system_id") SELECT "system_id", "created_at", "updated_at", "version", "description", "metadata", "file_name", "isTarget", "last_reserved_id", "open_status", "data_loss_issues", "header_version", "acdb_version_major", "acdb_version_minor", "acdb_version_revision", "acdb_version_cpl_info", "codec_infos", "modified_date", "oem_info", "project_system_id" FROM "files"`,
    );
    await queryRunner.query(`DROP TABLE "files"`);
    await queryRunner.query(`ALTER TABLE "temporary_files" RENAME TO "files"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_files_project_filename" ON "files" ("project_system_id", "file_name") `,
    );
    await queryRunner.query(`DROP INDEX "uk_configuration_file"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_configuration" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "file_system_id" integer NOT NULL, "port_strategy" varchar CHECK( "port_strategy" IN ('INPUT_ODD_OUTPUT_EVEN','SEQUENTIAL') ) NOT NULL, "extra_config" text, CONSTRAINT "FK_be312e55b8b1321dc1ca9ac1367" FOREIGN KEY ("file_system_id") REFERENCES "files" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_configuration"("system_id", "created_at", "updated_at", "version", "file_system_id", "port_strategy", "extra_config") SELECT "system_id", "created_at", "updated_at", "version", "file_system_id", "port_strategy", "extra_config" FROM "configuration"`,
    );
    await queryRunner.query(`DROP TABLE "configuration"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_configuration" RENAME TO "configuration"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_configuration_file" ON "configuration" ("file_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "uk_container_property_data"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_container_property_data" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "container_system_id" integer NOT NULL, "property_system_id" integer NOT NULL, "payload" blob NOT NULL, CONSTRAINT "FK_c1c5cb3bd5e4178f0e488bb38d3" FOREIGN KEY ("container_system_id") REFERENCES "containers" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_f24e865e61ed9747c72c8d41807" FOREIGN KEY ("property_system_id") REFERENCES "container_property_definitions" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_container_property_data"("system_id", "created_at", "updated_at", "version", "container_system_id", "property_system_id", "payload") SELECT "system_id", "created_at", "updated_at", "version", "container_system_id", "property_system_id", "payload" FROM "container_property_data"`,
    );
    await queryRunner.query(`DROP TABLE "container_property_data"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_container_property_data" RENAME TO "container_property_data"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_container_property_data" ON "container_property_data" ("container_system_id", "property_system_id") `,
    );
    await queryRunner.query(
      `DROP INDEX "uq_containers_container_id_file_system_id"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_containers" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "type" varchar(128) NOT NULL, "container_id" integer NOT NULL, "file_system_id" integer NOT NULL, CONSTRAINT "FK_653656dc62acc1aad3344064cd4" FOREIGN KEY ("file_system_id") REFERENCES "files" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_containers"("system_id", "created_at", "updated_at", "version", "type", "container_id", "file_system_id") SELECT "system_id", "created_at", "updated_at", "version", "type", "container_id", "file_system_id" FROM "containers"`,
    );
    await queryRunner.query(`DROP TABLE "containers"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_containers" RENAME TO "containers"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_containers_container_id_file_system_id" ON "containers" ("container_id", "file_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "uk_control_link_unique"`);
    await queryRunner.query(`DROP INDEX "idx_control_links_src_sg_scope"`);
    await queryRunner.query(`DROP INDEX "idx_control_links_dst_sg"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_control_links" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "file_system_id" integer NOT NULL, "peer_nodeA_system_id" integer NOT NULL, "peer_nodeB_system_id" integer NOT NULL, "nodeA_port_system_id" integer NOT NULL, "nodeB_port_system_id" integer NOT NULL, "heap_id" integer NOT NULL, "link_type" varchar CHECK( "link_type" IN ('INTRA_SUBGRAPH','INTRA_USECASE','INTER_USECASE') ) NOT NULL, "source_subgraph_system_id" integer NOT NULL, "dest_subgraph_system_id" integer NOT NULL, CONSTRAINT "FK_6990d878f1170b958d2b5b84abc" FOREIGN KEY ("peer_nodeA_system_id") REFERENCES "nodes" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_bc6af2a635beb595adbc823353f" FOREIGN KEY ("peer_nodeB_system_id") REFERENCES "nodes" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_7c4d63ebdc45c6656eae61597da" FOREIGN KEY ("nodeA_port_system_id") REFERENCES "control_ports" ("system_id") ON DELETE RESTRICT ON UPDATE NO ACTION, CONSTRAINT "FK_23e7e524f43b619b95126e0beae" FOREIGN KEY ("nodeB_port_system_id") REFERENCES "control_ports" ("system_id") ON DELETE RESTRICT ON UPDATE NO ACTION, CONSTRAINT "FK_94b068792b7eebd8af177381b5a" FOREIGN KEY ("source_subgraph_system_id") REFERENCES "subgraphs" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_44d7c0e83b3d27b4c6702361141" FOREIGN KEY ("dest_subgraph_system_id") REFERENCES "subgraphs" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_905a5bdeac2241c40d8f9317333" FOREIGN KEY ("file_system_id") REFERENCES "files" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_control_links"("system_id", "created_at", "updated_at", "version", "file_system_id", "peer_nodeA_system_id", "peer_nodeB_system_id", "nodeA_port_system_id", "nodeB_port_system_id", "heap_id", "link_type", "source_subgraph_system_id", "dest_subgraph_system_id") SELECT "system_id", "created_at", "updated_at", "version", "file_system_id", "peer_nodeA_system_id", "peer_nodeB_system_id", "nodeA_port_system_id", "nodeB_port_system_id", "heap_id", "link_type", "source_subgraph_system_id", "dest_subgraph_system_id" FROM "control_links"`,
    );
    await queryRunner.query(`DROP TABLE "control_links"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_control_links" RENAME TO "control_links"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_control_link_unique" ON "control_links" ("peer_nodeA_system_id", "peer_nodeB_system_id", "nodeA_port_system_id", "nodeB_port_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_control_links_src_sg_scope" ON "control_links" ("source_subgraph_system_id", "link_type") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_control_links_dst_sg" ON "control_links" ("dest_subgraph_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "uk_data_link_ports"`);
    await queryRunner.query(`DROP INDEX "idx_data_links_src_sg_scope"`);
    await queryRunner.query(`DROP INDEX "idx_data_links_dst_sg"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_data_links" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "source_node_system_id" integer NOT NULL, "destination_node_system_id" integer NOT NULL, "source_port_system_id" integer NOT NULL, "destination_port_system_id" integer NOT NULL, "link_type" varchar CHECK( "link_type" IN ('INTRA_SUBGRAPH','INTRA_USECASE','INTER_USECASE') ) NOT NULL, "source_subgraph_system_id" integer NOT NULL, "dest_subgraph_system_id" integer NOT NULL, "is_ec" integer, "file_system_id" integer NOT NULL, CONSTRAINT "FK_0689ab223db533fec111096d269" FOREIGN KEY ("source_node_system_id") REFERENCES "nodes" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_b413f58bc20c73d373e13cc890c" FOREIGN KEY ("destination_node_system_id") REFERENCES "nodes" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_6181688ff8eab9191e146c4c713" FOREIGN KEY ("source_port_system_id") REFERENCES "data_ports" ("system_id") ON DELETE RESTRICT ON UPDATE NO ACTION, CONSTRAINT "FK_77d577c47cf5c909e2574b08daf" FOREIGN KEY ("destination_port_system_id") REFERENCES "data_ports" ("system_id") ON DELETE RESTRICT ON UPDATE NO ACTION, CONSTRAINT "FK_85d0be5e966e332a322cc1bdee0" FOREIGN KEY ("source_subgraph_system_id") REFERENCES "subgraphs" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_7c9cd91ed8e7db389e00481cacf" FOREIGN KEY ("dest_subgraph_system_id") REFERENCES "subgraphs" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_628cc7d2bad0784170587371c68" FOREIGN KEY ("file_system_id") REFERENCES "files" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_data_links"("system_id", "created_at", "updated_at", "version", "source_node_system_id", "destination_node_system_id", "source_port_system_id", "destination_port_system_id", "link_type", "source_subgraph_system_id", "dest_subgraph_system_id", "is_ec", "file_system_id") SELECT "system_id", "created_at", "updated_at", "version", "source_node_system_id", "destination_node_system_id", "source_port_system_id", "destination_port_system_id", "link_type", "source_subgraph_system_id", "dest_subgraph_system_id", "is_ec", "file_system_id" FROM "data_links"`,
    );
    await queryRunner.query(`DROP TABLE "data_links"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_data_links" RENAME TO "data_links"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_data_link_ports" ON "data_links" ("source_port_system_id", "destination_port_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_data_links_src_sg_scope" ON "data_links" ("source_subgraph_system_id", "link_type") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_data_links_dst_sg" ON "data_links" ("dest_subgraph_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "idx_sls_file"`);
    await queryRunner.query(`DROP INDEX "idx_sls_data_link"`);
    await queryRunner.query(`DROP INDEX "idx_sls_src_port_file"`);
    await queryRunner.query(`DROP INDEX "idx_sls_dst_port_file"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_subsystem_data_links" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "source_node_system_id" integer NOT NULL, "destination_node_system_id" integer NOT NULL, "source_port_system_id" integer NOT NULL, "destination_port_system_id" integer NOT NULL, "data_link_system_id" integer NOT NULL, "file_system_id" integer NOT NULL, CONSTRAINT "FK_7b17fe1ea18d898a1e7e971f5f9" FOREIGN KEY ("source_node_system_id") REFERENCES "nodes" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_cac690487ce98e79771f5f536c4" FOREIGN KEY ("destination_node_system_id") REFERENCES "nodes" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_eb171f0953c8258961711195807" FOREIGN KEY ("source_port_system_id") REFERENCES "data_ports" ("system_id") ON DELETE RESTRICT ON UPDATE NO ACTION, CONSTRAINT "FK_1e4cbed9b48eebc754936ea8da9" FOREIGN KEY ("destination_port_system_id") REFERENCES "data_ports" ("system_id") ON DELETE RESTRICT ON UPDATE NO ACTION, CONSTRAINT "FK_839363d23bfddd1b714c07ea9b5" FOREIGN KEY ("data_link_system_id") REFERENCES "data_links" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_ff54d4053c24cdb4dc211bbfa2c" FOREIGN KEY ("file_system_id") REFERENCES "files" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_subsystem_data_links"("system_id", "created_at", "updated_at", "version", "source_node_system_id", "destination_node_system_id", "source_port_system_id", "destination_port_system_id", "data_link_system_id", "file_system_id") SELECT "system_id", "created_at", "updated_at", "version", "source_node_system_id", "destination_node_system_id", "source_port_system_id", "destination_port_system_id", "data_link_system_id", "file_system_id" FROM "subsystem_data_links"`,
    );
    await queryRunner.query(`DROP TABLE "subsystem_data_links"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_subsystem_data_links" RENAME TO "subsystem_data_links"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sls_file" ON "subsystem_data_links" ("file_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sls_data_link" ON "subsystem_data_links" ("data_link_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sls_src_port_file" ON "subsystem_data_links" ("source_port_system_id", "file_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sls_dst_port_file" ON "subsystem_data_links" ("destination_port_system_id", "file_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_ckv" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "spf_module_system_id" integer NOT NULL, "ui_persistence" blob, CONSTRAINT "FK_54454123d07e1f81369d5e16604" FOREIGN KEY ("spf_module_system_id") REFERENCES "spf_modules" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_ckv"("system_id", "created_at", "updated_at", "version", "spf_module_system_id", "ui_persistence") SELECT "system_id", "created_at", "updated_at", "version", "spf_module_system_id", "ui_persistence" FROM "ckv"`,
    );
    await queryRunner.query(`DROP TABLE "ckv"`);
    await queryRunner.query(`ALTER TABLE "temporary_ckv" RENAME TO "ckv"`);
    await queryRunner.query(`DROP INDEX "ix_ckv_parameter"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_ckv_parameter_payload" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "parameter_system_id" integer NOT NULL, "ckv_system_id" integer NOT NULL, "payload" blob NOT NULL, CONSTRAINT "FK_e073280524fccebf5a394bb1a41" FOREIGN KEY ("ckv_system_id") REFERENCES "ckv" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_93f75c6014fa77a2535a83a76b9" FOREIGN KEY ("parameter_system_id") REFERENCES "spf_module_parameter_definitions" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_ckv_parameter_payload"("system_id", "created_at", "updated_at", "version", "parameter_system_id", "ckv_system_id", "payload") SELECT "system_id", "created_at", "updated_at", "version", "parameter_system_id", "ckv_system_id", "payload" FROM "ckv_parameter_payload"`,
    );
    await queryRunner.query(`DROP TABLE "ckv_parameter_payload"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_ckv_parameter_payload" RENAME TO "ckv_parameter_payload"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ix_ckv_parameter" ON "ckv_parameter_payload" ("ckv_system_id", "parameter_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_ckv_values" ("ckv_system_id" integer NOT NULL, "value_def_system_id" integer NOT NULL, CONSTRAINT "FK_99016afdc94daeada620e143123" FOREIGN KEY ("ckv_system_id") REFERENCES "ckv" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_bee185843bdbad64dd7467888c9" FOREIGN KEY ("value_def_system_id") REFERENCES "arc_values" ("system_id") ON DELETE RESTRICT ON UPDATE NO ACTION, PRIMARY KEY ("ckv_system_id", "value_def_system_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_ckv_values"("ckv_system_id", "value_def_system_id") SELECT "ckv_system_id", "value_def_system_id" FROM "ckv_values"`,
    );
    await queryRunner.query(`DROP TABLE "ckv_values"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_ckv_values" RENAME TO "ckv_values"`,
    );
    await queryRunner.query(`DROP INDEX "uk_spf_module_properties_data"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_spf_module_properties_data" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "module_system_id" integer NOT NULL, "property_system_id" integer NOT NULL, "payload" blob NOT NULL, CONSTRAINT "FK_954e08b83e83ed65a6f39661b82" FOREIGN KEY ("module_system_id") REFERENCES "spf_modules" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_333da39983023319c09e4fc94a9" FOREIGN KEY ("property_system_id") REFERENCES "module_property_definitions" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_spf_module_properties_data"("system_id", "created_at", "updated_at", "version", "module_system_id", "property_system_id", "payload") SELECT "system_id", "created_at", "updated_at", "version", "module_system_id", "property_system_id", "payload" FROM "spf_module_properties_data"`,
    );
    await queryRunner.query(`DROP TABLE "spf_module_properties_data"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_spf_module_properties_data" RENAME TO "spf_module_properties_data"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_spf_module_properties_data" ON "spf_module_properties_data" ("module_system_id", "property_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "ix_module_tag_definition"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_module_tag_id_map" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "spf_module_system_id" integer NOT NULL, "tag_definition_system_id" integer NOT NULL, CONSTRAINT "FK_d5eb0ce9bb12ca525ce109e34c5" FOREIGN KEY ("spf_module_system_id") REFERENCES "spf_modules" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_8bc289af2ab39abd901f8e6e090" FOREIGN KEY ("tag_definition_system_id") REFERENCES "tag_definitions" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_module_tag_id_map"("system_id", "created_at", "updated_at", "version", "spf_module_system_id", "tag_definition_system_id") SELECT "system_id", "created_at", "updated_at", "version", "spf_module_system_id", "tag_definition_system_id" FROM "module_tag_id_map"`,
    );
    await queryRunner.query(`DROP TABLE "module_tag_id_map"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_module_tag_id_map" RENAME TO "module_tag_id_map"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ix_module_tag_definition" ON "module_tag_id_map" ("spf_module_system_id", "tag_definition_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_tkv" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "module_tag_id_map_system_id" integer NOT NULL, "ui_persistence" blob, CONSTRAINT "FK_c9e68f3cebaef023b81d68965c0" FOREIGN KEY ("module_tag_id_map_system_id") REFERENCES "module_tag_id_map" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_tkv"("system_id", "created_at", "updated_at", "version", "module_tag_id_map_system_id", "ui_persistence") SELECT "system_id", "created_at", "updated_at", "version", "module_tag_id_map_system_id", "ui_persistence" FROM "tkv"`,
    );
    await queryRunner.query(`DROP TABLE "tkv"`);
    await queryRunner.query(`ALTER TABLE "temporary_tkv" RENAME TO "tkv"`);
    await queryRunner.query(`DROP INDEX "ix_tkv_parameter"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_tkv_parameter_payload" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "parameter_system_id" integer NOT NULL, "tkv_system_id" integer NOT NULL, "payload" blob NOT NULL, CONSTRAINT "FK_d64a873462d104c7ad93e4fd394" FOREIGN KEY ("tkv_system_id") REFERENCES "tkv" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_d86fc696f63de7b8e2137786b7e" FOREIGN KEY ("parameter_system_id") REFERENCES "spf_module_parameter_definitions" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_tkv_parameter_payload"("system_id", "created_at", "updated_at", "version", "parameter_system_id", "tkv_system_id", "payload") SELECT "system_id", "created_at", "updated_at", "version", "parameter_system_id", "tkv_system_id", "payload" FROM "tkv_parameter_payload"`,
    );
    await queryRunner.query(`DROP TABLE "tkv_parameter_payload"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_tkv_parameter_payload" RENAME TO "tkv_parameter_payload"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ix_tkv_parameter" ON "tkv_parameter_payload" ("tkv_system_id", "parameter_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_tkv_values" ("tkv_system_id" integer NOT NULL, "value_def_system_id" integer NOT NULL, CONSTRAINT "FK_aff49dcb6c3d7cbbc233cf73d9e" FOREIGN KEY ("tkv_system_id") REFERENCES "tkv" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_1ab8517d5880b24522a6b710bfc" FOREIGN KEY ("value_def_system_id") REFERENCES "arc_values" ("system_id") ON DELETE RESTRICT ON UPDATE NO ACTION, PRIMARY KEY ("tkv_system_id", "value_def_system_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_tkv_values"("tkv_system_id", "value_def_system_id") SELECT "tkv_system_id", "value_def_system_id" FROM "tkv_values"`,
    );
    await queryRunner.query(`DROP TABLE "tkv_values"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_tkv_values" RENAME TO "tkv_values"`,
    );
    await queryRunner.query(`DROP INDEX "ix_spf_modules_subgraph_file_system"`);
    await queryRunner.query(
      `DROP INDEX "ix_spf_modules_container_file_system"`,
    );
    await queryRunner.query(
      `DROP INDEX "ix_spf_modules_definition_file_system"`,
    );
    await queryRunner.query(
      `DROP INDEX "uq_spf_modules_instance_id_file_system_id"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_spf_modules" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "instance_id" integer NOT NULL, "alias" varchar(256) NOT NULL, "subgraph_system_id" integer NOT NULL, "container_system_id" integer NOT NULL, "definition_system_id" integer NOT NULL, "file_system_id" integer NOT NULL, CONSTRAINT "FK_9acec50339165b4a9a5e3a350fb" FOREIGN KEY ("subgraph_system_id") REFERENCES "subgraphs" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_1942b4a9c50698203278d65f819" FOREIGN KEY ("container_system_id") REFERENCES "containers" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_331cda97fea725c5926690e4e79" FOREIGN KEY ("definition_system_id") REFERENCES "spf_module_definitions" ("system_id") ON DELETE RESTRICT ON UPDATE NO ACTION, CONSTRAINT "FK_aebc03a526b6d7a79a06f23476f" FOREIGN KEY ("file_system_id") REFERENCES "files" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_093ca4e9af4aa8635301be8face" FOREIGN KEY ("system_id") REFERENCES "nodes" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_spf_modules"("system_id", "created_at", "updated_at", "version", "instance_id", "alias", "subgraph_system_id", "container_system_id", "definition_system_id", "file_system_id") SELECT "system_id", "created_at", "updated_at", "version", "instance_id", "alias", "subgraph_system_id", "container_system_id", "definition_system_id", "file_system_id" FROM "spf_modules"`,
    );
    await queryRunner.query(`DROP TABLE "spf_modules"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_spf_modules" RENAME TO "spf_modules"`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_spf_modules_subgraph_file_system" ON "spf_modules" ("subgraph_system_id", "file_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_spf_modules_container_file_system" ON "spf_modules" ("container_system_id", "file_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_spf_modules_definition_file_system" ON "spf_modules" ("definition_system_id", "file_system_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_spf_modules_instance_id_file_system_id" ON "spf_modules" ("instance_id", "file_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "uk_control_port_node_port"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_control_ports" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "port_id" integer NOT NULL, "name" varchar(255), "is_static" boolean NOT NULL, "node_system_id" integer NOT NULL, CONSTRAINT "FK_e3d32131c0f147e7e9686d28274" FOREIGN KEY ("node_system_id") REFERENCES "nodes" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_control_ports"("system_id", "created_at", "updated_at", "version", "port_id", "name", "is_static", "node_system_id") SELECT "system_id", "created_at", "updated_at", "version", "port_id", "name", "is_static", "node_system_id" FROM "control_ports"`,
    );
    await queryRunner.query(`DROP TABLE "control_ports"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_control_ports" RENAME TO "control_ports"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_control_port_node_port" ON "control_ports" ("node_system_id", "port_id") `,
    );
    await queryRunner.query(`DROP INDEX "uk_intent_control_port_intent"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_intents" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "intent_id" integer NOT NULL, "control_port_system_id" integer NOT NULL, CONSTRAINT "FK_0c3f0e17916e1886499f2ae4719" FOREIGN KEY ("control_port_system_id") REFERENCES "control_ports" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_intents"("system_id", "created_at", "updated_at", "version", "intent_id", "control_port_system_id") SELECT "system_id", "created_at", "updated_at", "version", "intent_id", "control_port_system_id" FROM "intents"`,
    );
    await queryRunner.query(`DROP TABLE "intents"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_intents" RENAME TO "intents"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_intent_control_port_intent" ON "intents" ("control_port_system_id", "intent_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_data_ports" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "data_port_id" integer NOT NULL, "name" varchar(255), "port_io_type" varchar CHECK( "port_io_type" IN ('INPUT','OUTPUT','INPUT_OUTPUT','OUTPUT_INPUT') ) NOT NULL, "is_static" boolean NOT NULL, "node_system_id" integer NOT NULL, CONSTRAINT "FK_ddfcebab5f88031a5f80069caa3" FOREIGN KEY ("node_system_id") REFERENCES "nodes" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_data_ports"("system_id", "created_at", "updated_at", "version", "data_port_id", "name", "port_io_type", "is_static", "node_system_id") SELECT "system_id", "created_at", "updated_at", "version", "data_port_id", "name", "port_io_type", "is_static", "node_system_id" FROM "data_ports"`,
    );
    await queryRunner.query(`DROP TABLE "data_ports"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_data_ports" RENAME TO "data_ports"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_nodes" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "parent_id" integer, "type" varchar CHECK( "type" IN ('module','subsystem') ) NOT NULL, "file_system_id" integer NOT NULL, CONSTRAINT "FK_ad6993514a7c6452f375aec5333" FOREIGN KEY ("file_system_id") REFERENCES "files" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_nodes"("system_id", "created_at", "updated_at", "version", "parent_id", "type", "file_system_id") SELECT "system_id", "created_at", "updated_at", "version", "parent_id", "type", "file_system_id" FROM "nodes"`,
    );
    await queryRunner.query(`DROP TABLE "nodes"`);
    await queryRunner.query(`ALTER TABLE "temporary_nodes" RENAME TO "nodes"`);
    await queryRunner.query(`DROP INDEX "uk_subgraph_property_data"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_subgraph_property_data" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "subgraph_system_id" integer NOT NULL, "subgraph_property_system_id" integer NOT NULL, "payload" blob NOT NULL, CONSTRAINT "FK_941c1c33426e3184da0a2ab695d" FOREIGN KEY ("subgraph_system_id") REFERENCES "subgraphs" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_8ca7b74d2f74e12db60f4f3110d" FOREIGN KEY ("subgraph_property_system_id") REFERENCES "subgraph_property_definitions" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_subgraph_property_data"("system_id", "created_at", "updated_at", "version", "subgraph_system_id", "subgraph_property_system_id", "payload") SELECT "system_id", "created_at", "updated_at", "version", "subgraph_system_id", "subgraph_property_system_id", "payload" FROM "subgraph_property_data"`,
    );
    await queryRunner.query(`DROP TABLE "subgraph_property_data"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_subgraph_property_data" RENAME TO "subgraph_property_data"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_subgraph_property_data" ON "subgraph_property_data" ("subgraph_system_id", "subgraph_property_system_id") `,
    );
    await queryRunner.query(
      `DROP INDEX "uk_vcpm_instance_subgraph_definition"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_vcpm_instances" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "subgraph_system_id" integer NOT NULL, "vcpm_definition_id" integer NOT NULL, CONSTRAINT "FK_4dc761c763dc46dd85eb51e4bcd" FOREIGN KEY ("subgraph_system_id") REFERENCES "subgraphs" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_22ae0e2b638ee026530e347fa97" FOREIGN KEY ("vcpm_definition_id") REFERENCES "vcpm_module_definitions" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_vcpm_instances"("system_id", "created_at", "updated_at", "version", "subgraph_system_id", "vcpm_definition_id") SELECT "system_id", "created_at", "updated_at", "version", "subgraph_system_id", "vcpm_definition_id" FROM "vcpm_instances"`,
    );
    await queryRunner.query(`DROP TABLE "vcpm_instances"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_vcpm_instances" RENAME TO "vcpm_instances"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_vcpm_instance_subgraph_definition" ON "vcpm_instances" ("subgraph_system_id", "vcpm_definition_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_vcpm_ckv" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "vcpm_instance_system_id" integer NOT NULL, CONSTRAINT "FK_0e82104e5aeb06bb7b5fdb0e45a" FOREIGN KEY ("vcpm_instance_system_id") REFERENCES "vcpm_instances" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_vcpm_ckv"("system_id", "created_at", "updated_at", "version", "vcpm_instance_system_id") SELECT "system_id", "created_at", "updated_at", "version", "vcpm_instance_system_id" FROM "vcpm_ckv"`,
    );
    await queryRunner.query(`DROP TABLE "vcpm_ckv"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_vcpm_ckv" RENAME TO "vcpm_ckv"`,
    );
    await queryRunner.query(`DROP INDEX "uk_vcpm_parameter_payload"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_vcpm_parameter_payload" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "vcpm_parameter_system_id" integer NOT NULL, "vcpm_ckv_system_id" integer NOT NULL, "payload" blob NOT NULL, CONSTRAINT "FK_42f0ab70e8ff41f36bf8f2821d2" FOREIGN KEY ("vcpm_parameter_system_id") REFERENCES "vcpm_module_parameter_definitions" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_8898c47f1626d34833634c132e5" FOREIGN KEY ("vcpm_ckv_system_id") REFERENCES "vcpm_ckv" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_vcpm_parameter_payload"("system_id", "created_at", "updated_at", "version", "vcpm_parameter_system_id", "vcpm_ckv_system_id", "payload") SELECT "system_id", "created_at", "updated_at", "version", "vcpm_parameter_system_id", "vcpm_ckv_system_id", "payload" FROM "vcpm_parameter_payload"`,
    );
    await queryRunner.query(`DROP TABLE "vcpm_parameter_payload"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_vcpm_parameter_payload" RENAME TO "vcpm_parameter_payload"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_vcpm_parameter_payload" ON "vcpm_parameter_payload" ("vcpm_parameter_system_id", "vcpm_ckv_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_vcpm_ckv_values" ("vcpm_ckv_system_id" integer NOT NULL, "value_def_system_id" integer NOT NULL, CONSTRAINT "FK_c7d3d4f96aebbdbd3717db2b65a" FOREIGN KEY ("vcpm_ckv_system_id") REFERENCES "vcpm_ckv" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_bec82cd4468dfccdfb07a66545a" FOREIGN KEY ("value_def_system_id") REFERENCES "arc_values" ("system_id") ON DELETE RESTRICT ON UPDATE NO ACTION, PRIMARY KEY ("vcpm_ckv_system_id", "value_def_system_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_vcpm_ckv_values"("vcpm_ckv_system_id", "value_def_system_id") SELECT "vcpm_ckv_system_id", "value_def_system_id" FROM "vcpm_ckv_values"`,
    );
    await queryRunner.query(`DROP TABLE "vcpm_ckv_values"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_vcpm_ckv_values" RENAME TO "vcpm_ckv_values"`,
    );
    await queryRunner.query(`DROP INDEX "uq_subgraphs_name_file_system_id"`);
    await queryRunner.query(
      `DROP INDEX "uq_subgraphs_subgraph_id_file_system_id"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_subgraphs" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "name" varchar(256) NOT NULL, "subgraph_id" integer NOT NULL, "is_exported" integer NOT NULL, "file_system_id" integer NOT NULL, CONSTRAINT "FK_8f5322ebd0fbec146a71ab8a365" FOREIGN KEY ("file_system_id") REFERENCES "files" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_subgraphs"("system_id", "created_at", "updated_at", "version", "name", "subgraph_id", "is_exported", "file_system_id") SELECT "system_id", "created_at", "updated_at", "version", "name", "subgraph_id", "is_exported", "file_system_id" FROM "subgraphs"`,
    );
    await queryRunner.query(`DROP TABLE "subgraphs"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_subgraphs" RENAME TO "subgraphs"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_subgraphs_name_file_system_id" ON "subgraphs" ("name", "file_system_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_subgraphs_subgraph_id_file_system_id" ON "subgraphs" ("subgraph_id", "file_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_sgkv" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "subgraph_system_id" integer NOT NULL, CONSTRAINT "FK_40269c6b3fb4a573f133150f608" FOREIGN KEY ("subgraph_system_id") REFERENCES "subgraphs" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_sgkv"("system_id", "created_at", "updated_at", "version", "subgraph_system_id") SELECT "system_id", "created_at", "updated_at", "version", "subgraph_system_id" FROM "sgkv"`,
    );
    await queryRunner.query(`DROP TABLE "sgkv"`);
    await queryRunner.query(`ALTER TABLE "temporary_sgkv" RENAME TO "sgkv"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_sgkv_values" ("sgkv_system_id" integer NOT NULL, "value_def_system_id" integer NOT NULL, CONSTRAINT "FK_f291cdb5d2c8fad59f7ee8e3233" FOREIGN KEY ("sgkv_system_id") REFERENCES "sgkv" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_1f7e53f1188c6a460743930ec67" FOREIGN KEY ("value_def_system_id") REFERENCES "arc_values" ("system_id") ON DELETE RESTRICT ON UPDATE NO ACTION, PRIMARY KEY ("sgkv_system_id", "value_def_system_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_sgkv_values"("sgkv_system_id", "value_def_system_id") SELECT "sgkv_system_id", "value_def_system_id" FROM "sgkv_values"`,
    );
    await queryRunner.query(`DROP TABLE "sgkv_values"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_sgkv_values" RENAME TO "sgkv_values"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_subsystems" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "name" varchar(255) NOT NULL, CONSTRAINT "FK_84d896fd64dc0971dd15a904809" FOREIGN KEY ("system_id") REFERENCES "nodes" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_subsystems"("system_id", "created_at", "updated_at", "version", "name") SELECT "system_id", "created_at", "updated_at", "version", "name" FROM "subsystems"`,
    );
    await queryRunner.query(`DROP TABLE "subsystems"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_subsystems" RENAME TO "subsystems"`,
    );
    await queryRunner.query(`DROP INDEX "ix_use_case_alias"`);
    await queryRunner.query(`DROP INDEX "ix_use_case_file"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_use_cases" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "alias_id" integer NOT NULL, "alias" varchar(255) NOT NULL, "file_system_id" integer NOT NULL, CONSTRAINT "FK_8d8dca62e57c8b800925aec755a" FOREIGN KEY ("file_system_id") REFERENCES "files" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_use_cases"("system_id", "created_at", "updated_at", "version", "alias_id", "alias", "file_system_id") SELECT "system_id", "created_at", "updated_at", "version", "alias_id", "alias", "file_system_id" FROM "use_cases"`,
    );
    await queryRunner.query(`DROP TABLE "use_cases"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_use_cases" RENAME TO "use_cases"`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_use_case_alias" ON "use_cases" ("alias_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_use_case_file" ON "use_cases" ("file_system_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_usecase_gkv_values" ("usecase_system_id" integer NOT NULL, "value_def_system_id" integer NOT NULL, CONSTRAINT "FK_bb0b5cc8067540689f17150532c" FOREIGN KEY ("usecase_system_id") REFERENCES "use_cases" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_f9fae77cf4fa23f24e211374643" FOREIGN KEY ("value_def_system_id") REFERENCES "arc_values" ("system_id") ON DELETE RESTRICT ON UPDATE NO ACTION, PRIMARY KEY ("usecase_system_id", "value_def_system_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_usecase_gkv_values"("usecase_system_id", "value_def_system_id") SELECT "usecase_system_id", "value_def_system_id" FROM "usecase_gkv_values"`,
    );
    await queryRunner.query(`DROP TABLE "usecase_gkv_values"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_usecase_gkv_values" RENAME TO "usecase_gkv_values"`,
    );
    await queryRunner.query(`DROP INDEX "idx_use_case_subgraphs_subgraph"`);
    await queryRunner.query(`DROP INDEX "IDX_65e66135d222dfa6dc5fe528e6"`);
    await queryRunner.query(`DROP INDEX "IDX_943c72ed8170978a8c8402bdc1"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_use_case_subgraphs" ("usecase_system_id" integer NOT NULL, "subgraph_system_id" integer NOT NULL, CONSTRAINT "FK_65e66135d222dfa6dc5fe528e6f" FOREIGN KEY ("usecase_system_id") REFERENCES "use_cases" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_943c72ed8170978a8c8402bdc10" FOREIGN KEY ("subgraph_system_id") REFERENCES "subgraphs" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, PRIMARY KEY ("usecase_system_id", "subgraph_system_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_use_case_subgraphs"("usecase_system_id", "subgraph_system_id") SELECT "usecase_system_id", "subgraph_system_id" FROM "use_case_subgraphs"`,
    );
    await queryRunner.query(`DROP TABLE "use_case_subgraphs"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_use_case_subgraphs" RENAME TO "use_case_subgraphs"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_use_case_subgraphs_subgraph" ON "use_case_subgraphs" ("subgraph_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_65e66135d222dfa6dc5fe528e6" ON "use_case_subgraphs" ("usecase_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_943c72ed8170978a8c8402bdc1" ON "use_case_subgraphs" ("subgraph_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "idx_use_case_subgraph_pairs_sgs"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_use_case_subgraph_pairs" ("usecase_system_id" integer NOT NULL, "source_subgraph_system_id" integer NOT NULL, "dest_subgraph_system_id" integer NOT NULL, CONSTRAINT "FK_aaead9a615196a87f12481a7d34" FOREIGN KEY ("usecase_system_id") REFERENCES "use_cases" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_6d87d19e3e67fcbb513f97e54ab" FOREIGN KEY ("source_subgraph_system_id") REFERENCES "subgraphs" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_e46025dba07dfa20cd556172205" FOREIGN KEY ("dest_subgraph_system_id") REFERENCES "subgraphs" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION, PRIMARY KEY ("usecase_system_id", "source_subgraph_system_id", "dest_subgraph_system_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_use_case_subgraph_pairs"("usecase_system_id", "source_subgraph_system_id", "dest_subgraph_system_id") SELECT "usecase_system_id", "source_subgraph_system_id", "dest_subgraph_system_id" FROM "use_case_subgraph_pairs"`,
    );
    await queryRunner.query(`DROP TABLE "use_case_subgraph_pairs"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_use_case_subgraph_pairs" RENAME TO "use_case_subgraph_pairs"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_use_case_subgraph_pairs_sgs" ON "use_case_subgraph_pairs" ("source_subgraph_system_id", "dest_subgraph_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "idx_edit_actions_session"`);
    await queryRunner.query(`DROP INDEX "idx_edit_actions_entity_active"`);
    await queryRunner.query(`DROP INDEX "idx_edit_actions_table_active"`);
    await queryRunner.query(`DROP INDEX "idx_edit_actions_agg_active"`);
    await queryRunner.query(`DROP INDEX "idx_edit_actions_status_active"`);
    await queryRunner.query(`DROP INDEX "uniq_edit_actions_current"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_edit_actions" ("change_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "system_id" integer NOT NULL, "aggregate_id" integer NOT NULL DEFAULT (0), "session_id" integer NOT NULL, "table_name" varchar(100) NOT NULL, "operation" varchar CHECK( "operation" IN ('NONE','CREATE','UPDATE','DELETE') ) NOT NULL, "payload" text NOT NULL, "change_status" varchar CHECK( "change_status" IN ('STAGED','UNSTAGED') ) NOT NULL DEFAULT ('STAGED'), "base_version" integer, "group_id" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "valid_until" datetime, CONSTRAINT "FK_56f75f850acdde5e18d4eebdbdc" FOREIGN KEY ("session_id") REFERENCES "project_sessions" ("session_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_edit_actions"("change_id", "system_id", "aggregate_id", "session_id", "table_name", "operation", "payload", "change_status", "base_version", "group_id", "created_at", "valid_until") SELECT "change_id", "system_id", "aggregate_id", "session_id", "table_name", "operation", "payload", "change_status", "base_version", "group_id", "created_at", "valid_until" FROM "edit_actions"`,
    );
    await queryRunner.query(`DROP TABLE "edit_actions"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_edit_actions" RENAME TO "edit_actions"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_edit_actions_session" ON "edit_actions" ("session_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_edit_actions_entity_active" ON "edit_actions" ("session_id", "system_id") WHERE "valid_until" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_edit_actions_table_active" ON "edit_actions" ("session_id", "table_name") WHERE "valid_until" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_edit_actions_agg_active" ON "edit_actions" ("session_id", "aggregate_id") WHERE "valid_until" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_edit_actions_status_active" ON "edit_actions" ("session_id", "change_status") WHERE "valid_until" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uniq_edit_actions_current" ON "edit_actions" ("session_id", "system_id") WHERE "valid_until" IS NULL`,
    );
    await queryRunner.query(`DROP INDEX "idx_project_sessions_file"`);
    await queryRunner.query(`DROP INDEX "idx_project_sessions_status"`);
    await queryRunner.query(
      `DROP INDEX "uq_project_sessions_one_active_per_file"`,
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_project_sessions" ("session_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "file_system_id" integer NOT NULL, "user_id" varchar(255), "client_id" varchar(255) NOT NULL, "session_mode" varchar CHECK( "session_mode" IN ('TUNING','DESIGNER','DISCOVERY_WIZARD','DIFF_MERGE') ) NOT NULL, "status" varchar CHECK( "status" IN ('ACTIVE','ENDED') ) NOT NULL DEFAULT ('ACTIVE'), "started_at" datetime NOT NULL DEFAULT (datetime('now')), "ended_at" datetime, CONSTRAINT "FK_d62028536776bb550ec2985f58c" FOREIGN KEY ("file_system_id") REFERENCES "files" ("system_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_project_sessions"("session_id", "file_system_id", "user_id", "client_id", "session_mode", "status", "started_at", "ended_at") SELECT "session_id", "file_system_id", "user_id", "client_id", "session_mode", "status", "started_at", "ended_at" FROM "project_sessions"`,
    );
    await queryRunner.query(`DROP TABLE "project_sessions"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_project_sessions" RENAME TO "project_sessions"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_project_sessions_file" ON "project_sessions" ("file_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_project_sessions_status" ON "project_sessions" ("status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_project_sessions_one_active_per_file" ON "project_sessions" ("file_system_id") WHERE status = 'ACTIVE'`,
    );
    await queryRunner.query(`DROP INDEX "idx_session_commits_session"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_session_commits" ("commit_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "session_id" integer NOT NULL, "commit_message" text NOT NULL, "committed_at" datetime NOT NULL DEFAULT (datetime('now')), "change_count" integer NOT NULL DEFAULT (0), CONSTRAINT "FK_6a755b7e63615bb9a58f76f6dfc" FOREIGN KEY ("session_id") REFERENCES "project_sessions" ("session_id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_session_commits"("commit_id", "session_id", "commit_message", "committed_at", "change_count") SELECT "commit_id", "session_id", "commit_message", "committed_at", "change_count" FROM "session_commits"`,
    );
    await queryRunner.query(`DROP TABLE "session_commits"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_session_commits" RENAME TO "session_commits"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_session_commits_session" ON "session_commits" ("session_id") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_d5b97ccc404cecb9166a453280"`);
    await queryRunner.query(`DROP INDEX "IDX_06f2962641e6632eb9a7ac63da"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_use_case_categories" ("use_case_system_id" integer NOT NULL, "category_system_id" integer NOT NULL, CONSTRAINT "FK_d5b97ccc404cecb9166a4532804" FOREIGN KEY ("use_case_system_id") REFERENCES "use_cases" ("system_id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "FK_06f2962641e6632eb9a7ac63da9" FOREIGN KEY ("category_system_id") REFERENCES "use_case_categories_master" ("system_id") ON DELETE CASCADE ON UPDATE CASCADE, PRIMARY KEY ("use_case_system_id", "category_system_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_use_case_categories"("use_case_system_id", "category_system_id") SELECT "use_case_system_id", "category_system_id" FROM "use_case_categories"`,
    );
    await queryRunner.query(`DROP TABLE "use_case_categories"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_use_case_categories" RENAME TO "use_case_categories"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d5b97ccc404cecb9166a453280" ON "use_case_categories" ("use_case_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_06f2962641e6632eb9a7ac63da" ON "use_case_categories" ("category_system_id") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_06f2962641e6632eb9a7ac63da"`);
    await queryRunner.query(`DROP INDEX "IDX_d5b97ccc404cecb9166a453280"`);
    await queryRunner.query(
      `ALTER TABLE "use_case_categories" RENAME TO "temporary_use_case_categories"`,
    );
    await queryRunner.query(
      `CREATE TABLE "use_case_categories" ("use_case_system_id" integer NOT NULL, "category_system_id" integer NOT NULL, PRIMARY KEY ("use_case_system_id", "category_system_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "use_case_categories"("use_case_system_id", "category_system_id") SELECT "use_case_system_id", "category_system_id" FROM "temporary_use_case_categories"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_use_case_categories"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_06f2962641e6632eb9a7ac63da" ON "use_case_categories" ("category_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d5b97ccc404cecb9166a453280" ON "use_case_categories" ("use_case_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "idx_session_commits_session"`);
    await queryRunner.query(
      `ALTER TABLE "session_commits" RENAME TO "temporary_session_commits"`,
    );
    await queryRunner.query(
      `CREATE TABLE "session_commits" ("commit_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "session_id" integer NOT NULL, "commit_message" text NOT NULL, "committed_at" datetime NOT NULL DEFAULT (datetime('now')), "change_count" integer NOT NULL DEFAULT (0))`,
    );
    await queryRunner.query(
      `INSERT INTO "session_commits"("commit_id", "session_id", "commit_message", "committed_at", "change_count") SELECT "commit_id", "session_id", "commit_message", "committed_at", "change_count" FROM "temporary_session_commits"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_session_commits"`);
    await queryRunner.query(
      `CREATE INDEX "idx_session_commits_session" ON "session_commits" ("session_id") `,
    );
    await queryRunner.query(
      `DROP INDEX "uq_project_sessions_one_active_per_file"`,
    );
    await queryRunner.query(`DROP INDEX "idx_project_sessions_status"`);
    await queryRunner.query(`DROP INDEX "idx_project_sessions_file"`);
    await queryRunner.query(
      `ALTER TABLE "project_sessions" RENAME TO "temporary_project_sessions"`,
    );
    await queryRunner.query(
      `CREATE TABLE "project_sessions" ("session_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "file_system_id" integer NOT NULL, "user_id" varchar(255), "client_id" varchar(255) NOT NULL, "session_mode" varchar CHECK( "session_mode" IN ('TUNING','DESIGNER','DISCOVERY_WIZARD','DIFF_MERGE') ) NOT NULL, "status" varchar CHECK( "status" IN ('ACTIVE','ENDED') ) NOT NULL DEFAULT ('ACTIVE'), "started_at" datetime NOT NULL DEFAULT (datetime('now')), "ended_at" datetime)`,
    );
    await queryRunner.query(
      `INSERT INTO "project_sessions"("session_id", "file_system_id", "user_id", "client_id", "session_mode", "status", "started_at", "ended_at") SELECT "session_id", "file_system_id", "user_id", "client_id", "session_mode", "status", "started_at", "ended_at" FROM "temporary_project_sessions"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_project_sessions"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_project_sessions_one_active_per_file" ON "project_sessions" ("file_system_id") WHERE status = 'ACTIVE'`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_project_sessions_status" ON "project_sessions" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_project_sessions_file" ON "project_sessions" ("file_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "uniq_edit_actions_current"`);
    await queryRunner.query(`DROP INDEX "idx_edit_actions_status_active"`);
    await queryRunner.query(`DROP INDEX "idx_edit_actions_agg_active"`);
    await queryRunner.query(`DROP INDEX "idx_edit_actions_table_active"`);
    await queryRunner.query(`DROP INDEX "idx_edit_actions_entity_active"`);
    await queryRunner.query(`DROP INDEX "idx_edit_actions_session"`);
    await queryRunner.query(
      `ALTER TABLE "edit_actions" RENAME TO "temporary_edit_actions"`,
    );
    await queryRunner.query(
      `CREATE TABLE "edit_actions" ("change_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "system_id" integer NOT NULL, "aggregate_id" integer NOT NULL DEFAULT (0), "session_id" integer NOT NULL, "table_name" varchar(100) NOT NULL, "operation" varchar CHECK( "operation" IN ('NONE','CREATE','UPDATE','DELETE') ) NOT NULL, "payload" text NOT NULL, "change_status" varchar CHECK( "change_status" IN ('STAGED','UNSTAGED') ) NOT NULL DEFAULT ('STAGED'), "base_version" integer, "group_id" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "valid_until" datetime)`,
    );
    await queryRunner.query(
      `INSERT INTO "edit_actions"("change_id", "system_id", "aggregate_id", "session_id", "table_name", "operation", "payload", "change_status", "base_version", "group_id", "created_at", "valid_until") SELECT "change_id", "system_id", "aggregate_id", "session_id", "table_name", "operation", "payload", "change_status", "base_version", "group_id", "created_at", "valid_until" FROM "temporary_edit_actions"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_edit_actions"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uniq_edit_actions_current" ON "edit_actions" ("session_id", "system_id") WHERE "valid_until" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_edit_actions_status_active" ON "edit_actions" ("session_id", "change_status") WHERE "valid_until" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_edit_actions_agg_active" ON "edit_actions" ("session_id", "aggregate_id") WHERE "valid_until" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_edit_actions_table_active" ON "edit_actions" ("session_id", "table_name") WHERE "valid_until" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_edit_actions_entity_active" ON "edit_actions" ("session_id", "system_id") WHERE "valid_until" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_edit_actions_session" ON "edit_actions" ("session_id") `,
    );
    await queryRunner.query(`DROP INDEX "idx_use_case_subgraph_pairs_sgs"`);
    await queryRunner.query(
      `ALTER TABLE "use_case_subgraph_pairs" RENAME TO "temporary_use_case_subgraph_pairs"`,
    );
    await queryRunner.query(
      `CREATE TABLE "use_case_subgraph_pairs" ("usecase_system_id" integer NOT NULL, "source_subgraph_system_id" integer NOT NULL, "dest_subgraph_system_id" integer NOT NULL, PRIMARY KEY ("usecase_system_id", "source_subgraph_system_id", "dest_subgraph_system_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "use_case_subgraph_pairs"("usecase_system_id", "source_subgraph_system_id", "dest_subgraph_system_id") SELECT "usecase_system_id", "source_subgraph_system_id", "dest_subgraph_system_id" FROM "temporary_use_case_subgraph_pairs"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_use_case_subgraph_pairs"`);
    await queryRunner.query(
      `CREATE INDEX "idx_use_case_subgraph_pairs_sgs" ON "use_case_subgraph_pairs" ("source_subgraph_system_id", "dest_subgraph_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "IDX_943c72ed8170978a8c8402bdc1"`);
    await queryRunner.query(`DROP INDEX "IDX_65e66135d222dfa6dc5fe528e6"`);
    await queryRunner.query(`DROP INDEX "idx_use_case_subgraphs_subgraph"`);
    await queryRunner.query(
      `ALTER TABLE "use_case_subgraphs" RENAME TO "temporary_use_case_subgraphs"`,
    );
    await queryRunner.query(
      `CREATE TABLE "use_case_subgraphs" ("usecase_system_id" integer NOT NULL, "subgraph_system_id" integer NOT NULL, PRIMARY KEY ("usecase_system_id", "subgraph_system_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "use_case_subgraphs"("usecase_system_id", "subgraph_system_id") SELECT "usecase_system_id", "subgraph_system_id" FROM "temporary_use_case_subgraphs"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_use_case_subgraphs"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_943c72ed8170978a8c8402bdc1" ON "use_case_subgraphs" ("subgraph_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_65e66135d222dfa6dc5fe528e6" ON "use_case_subgraphs" ("usecase_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_use_case_subgraphs_subgraph" ON "use_case_subgraphs" ("subgraph_system_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "usecase_gkv_values" RENAME TO "temporary_usecase_gkv_values"`,
    );
    await queryRunner.query(
      `CREATE TABLE "usecase_gkv_values" ("usecase_system_id" integer NOT NULL, "value_def_system_id" integer NOT NULL, PRIMARY KEY ("usecase_system_id", "value_def_system_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "usecase_gkv_values"("usecase_system_id", "value_def_system_id") SELECT "usecase_system_id", "value_def_system_id" FROM "temporary_usecase_gkv_values"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_usecase_gkv_values"`);
    await queryRunner.query(`DROP INDEX "ix_use_case_file"`);
    await queryRunner.query(`DROP INDEX "ix_use_case_alias"`);
    await queryRunner.query(
      `ALTER TABLE "use_cases" RENAME TO "temporary_use_cases"`,
    );
    await queryRunner.query(
      `CREATE TABLE "use_cases" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "alias_id" integer NOT NULL, "alias" varchar(255) NOT NULL, "file_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "use_cases"("system_id", "created_at", "updated_at", "version", "alias_id", "alias", "file_system_id") SELECT "system_id", "created_at", "updated_at", "version", "alias_id", "alias", "file_system_id" FROM "temporary_use_cases"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_use_cases"`);
    await queryRunner.query(
      `CREATE INDEX "ix_use_case_file" ON "use_cases" ("file_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_use_case_alias" ON "use_cases" ("alias_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "subsystems" RENAME TO "temporary_subsystems"`,
    );
    await queryRunner.query(
      `CREATE TABLE "subsystems" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "name" varchar(255) NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "subsystems"("system_id", "created_at", "updated_at", "version", "name") SELECT "system_id", "created_at", "updated_at", "version", "name" FROM "temporary_subsystems"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_subsystems"`);
    await queryRunner.query(
      `ALTER TABLE "sgkv_values" RENAME TO "temporary_sgkv_values"`,
    );
    await queryRunner.query(
      `CREATE TABLE "sgkv_values" ("sgkv_system_id" integer NOT NULL, "value_def_system_id" integer NOT NULL, PRIMARY KEY ("sgkv_system_id", "value_def_system_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "sgkv_values"("sgkv_system_id", "value_def_system_id") SELECT "sgkv_system_id", "value_def_system_id" FROM "temporary_sgkv_values"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_sgkv_values"`);
    await queryRunner.query(`ALTER TABLE "sgkv" RENAME TO "temporary_sgkv"`);
    await queryRunner.query(
      `CREATE TABLE "sgkv" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "subgraph_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "sgkv"("system_id", "created_at", "updated_at", "version", "subgraph_system_id") SELECT "system_id", "created_at", "updated_at", "version", "subgraph_system_id" FROM "temporary_sgkv"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_sgkv"`);
    await queryRunner.query(
      `DROP INDEX "uq_subgraphs_subgraph_id_file_system_id"`,
    );
    await queryRunner.query(`DROP INDEX "uq_subgraphs_name_file_system_id"`);
    await queryRunner.query(
      `ALTER TABLE "subgraphs" RENAME TO "temporary_subgraphs"`,
    );
    await queryRunner.query(
      `CREATE TABLE "subgraphs" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "name" varchar(256) NOT NULL, "subgraph_id" integer NOT NULL, "is_exported" integer NOT NULL, "file_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "subgraphs"("system_id", "created_at", "updated_at", "version", "name", "subgraph_id", "is_exported", "file_system_id") SELECT "system_id", "created_at", "updated_at", "version", "name", "subgraph_id", "is_exported", "file_system_id" FROM "temporary_subgraphs"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_subgraphs"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_subgraphs_subgraph_id_file_system_id" ON "subgraphs" ("subgraph_id", "file_system_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_subgraphs_name_file_system_id" ON "subgraphs" ("name", "file_system_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "vcpm_ckv_values" RENAME TO "temporary_vcpm_ckv_values"`,
    );
    await queryRunner.query(
      `CREATE TABLE "vcpm_ckv_values" ("vcpm_ckv_system_id" integer NOT NULL, "value_def_system_id" integer NOT NULL, PRIMARY KEY ("vcpm_ckv_system_id", "value_def_system_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "vcpm_ckv_values"("vcpm_ckv_system_id", "value_def_system_id") SELECT "vcpm_ckv_system_id", "value_def_system_id" FROM "temporary_vcpm_ckv_values"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_vcpm_ckv_values"`);
    await queryRunner.query(`DROP INDEX "uk_vcpm_parameter_payload"`);
    await queryRunner.query(
      `ALTER TABLE "vcpm_parameter_payload" RENAME TO "temporary_vcpm_parameter_payload"`,
    );
    await queryRunner.query(
      `CREATE TABLE "vcpm_parameter_payload" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "vcpm_parameter_system_id" integer NOT NULL, "vcpm_ckv_system_id" integer NOT NULL, "payload" blob NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "vcpm_parameter_payload"("system_id", "created_at", "updated_at", "version", "vcpm_parameter_system_id", "vcpm_ckv_system_id", "payload") SELECT "system_id", "created_at", "updated_at", "version", "vcpm_parameter_system_id", "vcpm_ckv_system_id", "payload" FROM "temporary_vcpm_parameter_payload"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_vcpm_parameter_payload"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_vcpm_parameter_payload" ON "vcpm_parameter_payload" ("vcpm_parameter_system_id", "vcpm_ckv_system_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "vcpm_ckv" RENAME TO "temporary_vcpm_ckv"`,
    );
    await queryRunner.query(
      `CREATE TABLE "vcpm_ckv" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "vcpm_instance_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "vcpm_ckv"("system_id", "created_at", "updated_at", "version", "vcpm_instance_system_id") SELECT "system_id", "created_at", "updated_at", "version", "vcpm_instance_system_id" FROM "temporary_vcpm_ckv"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_vcpm_ckv"`);
    await queryRunner.query(
      `DROP INDEX "uk_vcpm_instance_subgraph_definition"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vcpm_instances" RENAME TO "temporary_vcpm_instances"`,
    );
    await queryRunner.query(
      `CREATE TABLE "vcpm_instances" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "subgraph_system_id" integer NOT NULL, "vcpm_definition_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "vcpm_instances"("system_id", "created_at", "updated_at", "version", "subgraph_system_id", "vcpm_definition_id") SELECT "system_id", "created_at", "updated_at", "version", "subgraph_system_id", "vcpm_definition_id" FROM "temporary_vcpm_instances"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_vcpm_instances"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_vcpm_instance_subgraph_definition" ON "vcpm_instances" ("subgraph_system_id", "vcpm_definition_id") `,
    );
    await queryRunner.query(`DROP INDEX "uk_subgraph_property_data"`);
    await queryRunner.query(
      `ALTER TABLE "subgraph_property_data" RENAME TO "temporary_subgraph_property_data"`,
    );
    await queryRunner.query(
      `CREATE TABLE "subgraph_property_data" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "subgraph_system_id" integer NOT NULL, "subgraph_property_system_id" integer NOT NULL, "payload" blob NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "subgraph_property_data"("system_id", "created_at", "updated_at", "version", "subgraph_system_id", "subgraph_property_system_id", "payload") SELECT "system_id", "created_at", "updated_at", "version", "subgraph_system_id", "subgraph_property_system_id", "payload" FROM "temporary_subgraph_property_data"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_subgraph_property_data"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_subgraph_property_data" ON "subgraph_property_data" ("subgraph_system_id", "subgraph_property_system_id") `,
    );
    await queryRunner.query(`ALTER TABLE "nodes" RENAME TO "temporary_nodes"`);
    await queryRunner.query(
      `CREATE TABLE "nodes" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "parent_id" integer, "type" varchar CHECK( "type" IN ('module','subsystem') ) NOT NULL, "file_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "nodes"("system_id", "created_at", "updated_at", "version", "parent_id", "type", "file_system_id") SELECT "system_id", "created_at", "updated_at", "version", "parent_id", "type", "file_system_id" FROM "temporary_nodes"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_nodes"`);
    await queryRunner.query(
      `ALTER TABLE "data_ports" RENAME TO "temporary_data_ports"`,
    );
    await queryRunner.query(
      `CREATE TABLE "data_ports" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "data_port_id" integer NOT NULL, "name" varchar(255), "port_io_type" varchar CHECK( "port_io_type" IN ('INPUT','OUTPUT','INPUT_OUTPUT','OUTPUT_INPUT') ) NOT NULL, "is_static" boolean NOT NULL, "node_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "data_ports"("system_id", "created_at", "updated_at", "version", "data_port_id", "name", "port_io_type", "is_static", "node_system_id") SELECT "system_id", "created_at", "updated_at", "version", "data_port_id", "name", "port_io_type", "is_static", "node_system_id" FROM "temporary_data_ports"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_data_ports"`);
    await queryRunner.query(`DROP INDEX "uk_intent_control_port_intent"`);
    await queryRunner.query(
      `ALTER TABLE "intents" RENAME TO "temporary_intents"`,
    );
    await queryRunner.query(
      `CREATE TABLE "intents" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "intent_id" integer NOT NULL, "control_port_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "intents"("system_id", "created_at", "updated_at", "version", "intent_id", "control_port_system_id") SELECT "system_id", "created_at", "updated_at", "version", "intent_id", "control_port_system_id" FROM "temporary_intents"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_intents"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_intent_control_port_intent" ON "intents" ("control_port_system_id", "intent_id") `,
    );
    await queryRunner.query(`DROP INDEX "uk_control_port_node_port"`);
    await queryRunner.query(
      `ALTER TABLE "control_ports" RENAME TO "temporary_control_ports"`,
    );
    await queryRunner.query(
      `CREATE TABLE "control_ports" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "port_id" integer NOT NULL, "name" varchar(255), "is_static" boolean NOT NULL, "node_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "control_ports"("system_id", "created_at", "updated_at", "version", "port_id", "name", "is_static", "node_system_id") SELECT "system_id", "created_at", "updated_at", "version", "port_id", "name", "is_static", "node_system_id" FROM "temporary_control_ports"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_control_ports"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_control_port_node_port" ON "control_ports" ("node_system_id", "port_id") `,
    );
    await queryRunner.query(
      `DROP INDEX "uq_spf_modules_instance_id_file_system_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "ix_spf_modules_definition_file_system"`,
    );
    await queryRunner.query(
      `DROP INDEX "ix_spf_modules_container_file_system"`,
    );
    await queryRunner.query(`DROP INDEX "ix_spf_modules_subgraph_file_system"`);
    await queryRunner.query(
      `ALTER TABLE "spf_modules" RENAME TO "temporary_spf_modules"`,
    );
    await queryRunner.query(
      `CREATE TABLE "spf_modules" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "instance_id" integer NOT NULL, "alias" varchar(256) NOT NULL, "subgraph_system_id" integer NOT NULL, "container_system_id" integer NOT NULL, "definition_system_id" integer NOT NULL, "file_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "spf_modules"("system_id", "created_at", "updated_at", "version", "instance_id", "alias", "subgraph_system_id", "container_system_id", "definition_system_id", "file_system_id") SELECT "system_id", "created_at", "updated_at", "version", "instance_id", "alias", "subgraph_system_id", "container_system_id", "definition_system_id", "file_system_id" FROM "temporary_spf_modules"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_spf_modules"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_spf_modules_instance_id_file_system_id" ON "spf_modules" ("instance_id", "file_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_spf_modules_definition_file_system" ON "spf_modules" ("definition_system_id", "file_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_spf_modules_container_file_system" ON "spf_modules" ("container_system_id", "file_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_spf_modules_subgraph_file_system" ON "spf_modules" ("subgraph_system_id", "file_system_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "tkv_values" RENAME TO "temporary_tkv_values"`,
    );
    await queryRunner.query(
      `CREATE TABLE "tkv_values" ("tkv_system_id" integer NOT NULL, "value_def_system_id" integer NOT NULL, PRIMARY KEY ("tkv_system_id", "value_def_system_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "tkv_values"("tkv_system_id", "value_def_system_id") SELECT "tkv_system_id", "value_def_system_id" FROM "temporary_tkv_values"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_tkv_values"`);
    await queryRunner.query(`DROP INDEX "ix_tkv_parameter"`);
    await queryRunner.query(
      `ALTER TABLE "tkv_parameter_payload" RENAME TO "temporary_tkv_parameter_payload"`,
    );
    await queryRunner.query(
      `CREATE TABLE "tkv_parameter_payload" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "parameter_system_id" integer NOT NULL, "tkv_system_id" integer NOT NULL, "payload" blob NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "tkv_parameter_payload"("system_id", "created_at", "updated_at", "version", "parameter_system_id", "tkv_system_id", "payload") SELECT "system_id", "created_at", "updated_at", "version", "parameter_system_id", "tkv_system_id", "payload" FROM "temporary_tkv_parameter_payload"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_tkv_parameter_payload"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ix_tkv_parameter" ON "tkv_parameter_payload" ("tkv_system_id", "parameter_system_id") `,
    );
    await queryRunner.query(`ALTER TABLE "tkv" RENAME TO "temporary_tkv"`);
    await queryRunner.query(
      `CREATE TABLE "tkv" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "module_tag_id_map_system_id" integer NOT NULL, "ui_persistence" blob)`,
    );
    await queryRunner.query(
      `INSERT INTO "tkv"("system_id", "created_at", "updated_at", "version", "module_tag_id_map_system_id", "ui_persistence") SELECT "system_id", "created_at", "updated_at", "version", "module_tag_id_map_system_id", "ui_persistence" FROM "temporary_tkv"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_tkv"`);
    await queryRunner.query(`DROP INDEX "ix_module_tag_definition"`);
    await queryRunner.query(
      `ALTER TABLE "module_tag_id_map" RENAME TO "temporary_module_tag_id_map"`,
    );
    await queryRunner.query(
      `CREATE TABLE "module_tag_id_map" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "spf_module_system_id" integer NOT NULL, "tag_definition_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "module_tag_id_map"("system_id", "created_at", "updated_at", "version", "spf_module_system_id", "tag_definition_system_id") SELECT "system_id", "created_at", "updated_at", "version", "spf_module_system_id", "tag_definition_system_id" FROM "temporary_module_tag_id_map"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_module_tag_id_map"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ix_module_tag_definition" ON "module_tag_id_map" ("spf_module_system_id", "tag_definition_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "uk_spf_module_properties_data"`);
    await queryRunner.query(
      `ALTER TABLE "spf_module_properties_data" RENAME TO "temporary_spf_module_properties_data"`,
    );
    await queryRunner.query(
      `CREATE TABLE "spf_module_properties_data" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "module_system_id" integer NOT NULL, "property_system_id" integer NOT NULL, "payload" blob NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "spf_module_properties_data"("system_id", "created_at", "updated_at", "version", "module_system_id", "property_system_id", "payload") SELECT "system_id", "created_at", "updated_at", "version", "module_system_id", "property_system_id", "payload" FROM "temporary_spf_module_properties_data"`,
    );
    await queryRunner.query(
      `DROP TABLE "temporary_spf_module_properties_data"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_spf_module_properties_data" ON "spf_module_properties_data" ("module_system_id", "property_system_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "ckv_values" RENAME TO "temporary_ckv_values"`,
    );
    await queryRunner.query(
      `CREATE TABLE "ckv_values" ("ckv_system_id" integer NOT NULL, "value_def_system_id" integer NOT NULL, PRIMARY KEY ("ckv_system_id", "value_def_system_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "ckv_values"("ckv_system_id", "value_def_system_id") SELECT "ckv_system_id", "value_def_system_id" FROM "temporary_ckv_values"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_ckv_values"`);
    await queryRunner.query(`DROP INDEX "ix_ckv_parameter"`);
    await queryRunner.query(
      `ALTER TABLE "ckv_parameter_payload" RENAME TO "temporary_ckv_parameter_payload"`,
    );
    await queryRunner.query(
      `CREATE TABLE "ckv_parameter_payload" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "parameter_system_id" integer NOT NULL, "ckv_system_id" integer NOT NULL, "payload" blob NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "ckv_parameter_payload"("system_id", "created_at", "updated_at", "version", "parameter_system_id", "ckv_system_id", "payload") SELECT "system_id", "created_at", "updated_at", "version", "parameter_system_id", "ckv_system_id", "payload" FROM "temporary_ckv_parameter_payload"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_ckv_parameter_payload"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ix_ckv_parameter" ON "ckv_parameter_payload" ("ckv_system_id", "parameter_system_id") `,
    );
    await queryRunner.query(`ALTER TABLE "ckv" RENAME TO "temporary_ckv"`);
    await queryRunner.query(
      `CREATE TABLE "ckv" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "spf_module_system_id" integer NOT NULL, "ui_persistence" blob)`,
    );
    await queryRunner.query(
      `INSERT INTO "ckv"("system_id", "created_at", "updated_at", "version", "spf_module_system_id", "ui_persistence") SELECT "system_id", "created_at", "updated_at", "version", "spf_module_system_id", "ui_persistence" FROM "temporary_ckv"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_ckv"`);
    await queryRunner.query(`DROP INDEX "idx_sls_dst_port_file"`);
    await queryRunner.query(`DROP INDEX "idx_sls_src_port_file"`);
    await queryRunner.query(`DROP INDEX "idx_sls_data_link"`);
    await queryRunner.query(`DROP INDEX "idx_sls_file"`);
    await queryRunner.query(
      `ALTER TABLE "subsystem_data_links" RENAME TO "temporary_subsystem_data_links"`,
    );
    await queryRunner.query(
      `CREATE TABLE "subsystem_data_links" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "source_node_system_id" integer NOT NULL, "destination_node_system_id" integer NOT NULL, "source_port_system_id" integer NOT NULL, "destination_port_system_id" integer NOT NULL, "data_link_system_id" integer NOT NULL, "file_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "subsystem_data_links"("system_id", "created_at", "updated_at", "version", "source_node_system_id", "destination_node_system_id", "source_port_system_id", "destination_port_system_id", "data_link_system_id", "file_system_id") SELECT "system_id", "created_at", "updated_at", "version", "source_node_system_id", "destination_node_system_id", "source_port_system_id", "destination_port_system_id", "data_link_system_id", "file_system_id" FROM "temporary_subsystem_data_links"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_subsystem_data_links"`);
    await queryRunner.query(
      `CREATE INDEX "idx_sls_dst_port_file" ON "subsystem_data_links" ("destination_port_system_id", "file_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sls_src_port_file" ON "subsystem_data_links" ("source_port_system_id", "file_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sls_data_link" ON "subsystem_data_links" ("data_link_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sls_file" ON "subsystem_data_links" ("file_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "idx_data_links_dst_sg"`);
    await queryRunner.query(`DROP INDEX "idx_data_links_src_sg_scope"`);
    await queryRunner.query(`DROP INDEX "uk_data_link_ports"`);
    await queryRunner.query(
      `ALTER TABLE "data_links" RENAME TO "temporary_data_links"`,
    );
    await queryRunner.query(
      `CREATE TABLE "data_links" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "source_node_system_id" integer NOT NULL, "destination_node_system_id" integer NOT NULL, "source_port_system_id" integer NOT NULL, "destination_port_system_id" integer NOT NULL, "link_type" varchar CHECK( "link_type" IN ('INTRA_SUBGRAPH','INTRA_USECASE','INTER_USECASE') ) NOT NULL, "source_subgraph_system_id" integer NOT NULL, "dest_subgraph_system_id" integer NOT NULL, "is_ec" integer, "file_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "data_links"("system_id", "created_at", "updated_at", "version", "source_node_system_id", "destination_node_system_id", "source_port_system_id", "destination_port_system_id", "link_type", "source_subgraph_system_id", "dest_subgraph_system_id", "is_ec", "file_system_id") SELECT "system_id", "created_at", "updated_at", "version", "source_node_system_id", "destination_node_system_id", "source_port_system_id", "destination_port_system_id", "link_type", "source_subgraph_system_id", "dest_subgraph_system_id", "is_ec", "file_system_id" FROM "temporary_data_links"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_data_links"`);
    await queryRunner.query(
      `CREATE INDEX "idx_data_links_dst_sg" ON "data_links" ("dest_subgraph_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_data_links_src_sg_scope" ON "data_links" ("source_subgraph_system_id", "link_type") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_data_link_ports" ON "data_links" ("source_port_system_id", "destination_port_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "idx_control_links_dst_sg"`);
    await queryRunner.query(`DROP INDEX "idx_control_links_src_sg_scope"`);
    await queryRunner.query(`DROP INDEX "uk_control_link_unique"`);
    await queryRunner.query(
      `ALTER TABLE "control_links" RENAME TO "temporary_control_links"`,
    );
    await queryRunner.query(
      `CREATE TABLE "control_links" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "file_system_id" integer NOT NULL, "peer_nodeA_system_id" integer NOT NULL, "peer_nodeB_system_id" integer NOT NULL, "nodeA_port_system_id" integer NOT NULL, "nodeB_port_system_id" integer NOT NULL, "heap_id" integer NOT NULL, "link_type" varchar CHECK( "link_type" IN ('INTRA_SUBGRAPH','INTRA_USECASE','INTER_USECASE') ) NOT NULL, "source_subgraph_system_id" integer NOT NULL, "dest_subgraph_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "control_links"("system_id", "created_at", "updated_at", "version", "file_system_id", "peer_nodeA_system_id", "peer_nodeB_system_id", "nodeA_port_system_id", "nodeB_port_system_id", "heap_id", "link_type", "source_subgraph_system_id", "dest_subgraph_system_id") SELECT "system_id", "created_at", "updated_at", "version", "file_system_id", "peer_nodeA_system_id", "peer_nodeB_system_id", "nodeA_port_system_id", "nodeB_port_system_id", "heap_id", "link_type", "source_subgraph_system_id", "dest_subgraph_system_id" FROM "temporary_control_links"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_control_links"`);
    await queryRunner.query(
      `CREATE INDEX "idx_control_links_dst_sg" ON "control_links" ("dest_subgraph_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_control_links_src_sg_scope" ON "control_links" ("source_subgraph_system_id", "link_type") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_control_link_unique" ON "control_links" ("peer_nodeA_system_id", "peer_nodeB_system_id", "nodeA_port_system_id", "nodeB_port_system_id") `,
    );
    await queryRunner.query(
      `DROP INDEX "uq_containers_container_id_file_system_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "containers" RENAME TO "temporary_containers"`,
    );
    await queryRunner.query(
      `CREATE TABLE "containers" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "type" varchar(128) NOT NULL, "container_id" integer NOT NULL, "file_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "containers"("system_id", "created_at", "updated_at", "version", "type", "container_id", "file_system_id") SELECT "system_id", "created_at", "updated_at", "version", "type", "container_id", "file_system_id" FROM "temporary_containers"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_containers"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_containers_container_id_file_system_id" ON "containers" ("container_id", "file_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "uk_container_property_data"`);
    await queryRunner.query(
      `ALTER TABLE "container_property_data" RENAME TO "temporary_container_property_data"`,
    );
    await queryRunner.query(
      `CREATE TABLE "container_property_data" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "container_system_id" integer NOT NULL, "property_system_id" integer NOT NULL, "payload" blob NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "container_property_data"("system_id", "created_at", "updated_at", "version", "container_system_id", "property_system_id", "payload") SELECT "system_id", "created_at", "updated_at", "version", "container_system_id", "property_system_id", "payload" FROM "temporary_container_property_data"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_container_property_data"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_container_property_data" ON "container_property_data" ("container_system_id", "property_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "uk_configuration_file"`);
    await queryRunner.query(
      `ALTER TABLE "configuration" RENAME TO "temporary_configuration"`,
    );
    await queryRunner.query(
      `CREATE TABLE "configuration" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "file_system_id" integer NOT NULL, "port_strategy" varchar CHECK( "port_strategy" IN ('INPUT_ODD_OUTPUT_EVEN','SEQUENTIAL') ) NOT NULL, "extra_config" text)`,
    );
    await queryRunner.query(
      `INSERT INTO "configuration"("system_id", "created_at", "updated_at", "version", "file_system_id", "port_strategy", "extra_config") SELECT "system_id", "created_at", "updated_at", "version", "file_system_id", "port_strategy", "extra_config" FROM "temporary_configuration"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_configuration"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_configuration_file" ON "configuration" ("file_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "uk_files_project_filename"`);
    await queryRunner.query(`ALTER TABLE "files" RENAME TO "temporary_files"`);
    await queryRunner.query(
      `CREATE TABLE "files" ("system_id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "description" text NOT NULL, "metadata" text NOT NULL, "file_name" varchar(250) NOT NULL, "isTarget" integer NOT NULL, "last_reserved_id" integer NOT NULL DEFAULT (0), "open_status" varchar(30) NOT NULL DEFAULT ('LOADING'), "data_loss_issues" text, "header_version" integer NOT NULL DEFAULT (0), "acdb_version_major" integer NOT NULL DEFAULT (0), "acdb_version_minor" integer NOT NULL DEFAULT (0), "acdb_version_revision" integer NOT NULL DEFAULT (0), "acdb_version_cpl_info" integer NOT NULL DEFAULT (0), "codec_infos" text NOT NULL DEFAULT ('[]'), "modified_date" integer NOT NULL DEFAULT (0), "oem_info" text NOT NULL DEFAULT (''), "project_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "files"("system_id", "created_at", "updated_at", "version", "description", "metadata", "file_name", "isTarget", "last_reserved_id", "open_status", "data_loss_issues", "header_version", "acdb_version_major", "acdb_version_minor", "acdb_version_revision", "acdb_version_cpl_info", "codec_infos", "modified_date", "oem_info", "project_system_id") SELECT "system_id", "created_at", "updated_at", "version", "description", "metadata", "file_name", "isTarget", "last_reserved_id", "open_status", "data_loss_issues", "header_version", "acdb_version_major", "acdb_version_minor", "acdb_version_revision", "acdb_version_cpl_info", "codec_infos", "modified_date", "oem_info", "project_system_id" FROM "temporary_files"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_files"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_files_project_filename" ON "files" ("project_system_id", "file_name") `,
    );
    await queryRunner.query(
      `DROP INDEX "uq_module_manager_data_processor_module"`,
    );
    await queryRunner.query(
      `ALTER TABLE "module_manager_data" RENAME TO "temporary_module_manager_data"`,
    );
    await queryRunner.query(
      `CREATE TABLE "module_manager_data" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "processor_definition_system_id" integer NOT NULL, "module_definition_system_id" integer NOT NULL, "file_system_id" integer NOT NULL, "module_type" integer NOT NULL, "interface_type" integer NOT NULL, "interface_version" integer NOT NULL, "file_name" varchar(255) NOT NULL, "tag" varchar(100) NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "module_manager_data"("system_id", "created_at", "updated_at", "version", "processor_definition_system_id", "module_definition_system_id", "file_system_id", "module_type", "interface_type", "interface_version", "file_name", "tag") SELECT "system_id", "created_at", "updated_at", "version", "processor_definition_system_id", "module_definition_system_id", "file_system_id", "module_type", "interface_type", "interface_version", "file_name", "tag" FROM "temporary_module_manager_data"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_module_manager_data"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_module_manager_data_processor_module" ON "module_manager_data" ("processor_definition_system_id", "module_definition_system_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "dkv_values" RENAME TO "temporary_dkv_values"`,
    );
    await queryRunner.query(
      `CREATE TABLE "dkv_values" ("dkv_system_id" integer NOT NULL, "value_def_system_id" integer NOT NULL, PRIMARY KEY ("dkv_system_id", "value_def_system_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "dkv_values"("dkv_system_id", "value_def_system_id") SELECT "dkv_system_id", "value_def_system_id" FROM "temporary_dkv_values"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_dkv_values"`);
    await queryRunner.query(`DROP INDEX "uk_dkv_parameter_payload"`);
    await queryRunner.query(
      `ALTER TABLE "dkv_parameter_payload" RENAME TO "temporary_dkv_parameter_payload"`,
    );
    await queryRunner.query(
      `CREATE TABLE "dkv_parameter_payload" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "parameter_system_id" integer NOT NULL, "dkv_system_id" integer NOT NULL, "payload" blob)`,
    );
    await queryRunner.query(
      `INSERT INTO "dkv_parameter_payload"("system_id", "created_at", "updated_at", "version", "parameter_system_id", "dkv_system_id", "payload") SELECT "system_id", "created_at", "updated_at", "version", "parameter_system_id", "dkv_system_id", "payload" FROM "temporary_dkv_parameter_payload"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_dkv_parameter_payload"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_dkv_parameter_payload" ON "dkv_parameter_payload" ("dkv_system_id", "parameter_system_id") `,
    );
    await queryRunner.query(`ALTER TABLE "dkv" RENAME TO "temporary_dkv"`);
    await queryRunner.query(
      `CREATE TABLE "dkv" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "driver_module_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "dkv"("system_id", "created_at", "updated_at", "version", "driver_module_system_id") SELECT "system_id", "created_at", "updated_at", "version", "driver_module_system_id" FROM "temporary_dkv"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_dkv"`);
    await queryRunner.query(
      `DROP INDEX "uq_driver_modules_definition_system_id_file_system_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "ix_driver_modules_definition_file_system"`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_modules" RENAME TO "temporary_driver_modules"`,
    );
    await queryRunner.query(
      `CREATE TABLE "driver_modules" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "definition_system_id" integer NOT NULL, "file_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "driver_modules"("system_id", "created_at", "updated_at", "version", "definition_system_id", "file_system_id") SELECT "system_id", "created_at", "updated_at", "version", "definition_system_id", "file_system_id" FROM "temporary_driver_modules"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_driver_modules"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_driver_modules_definition_system_id_file_system_id" ON "driver_modules" ("definition_system_id", "file_system_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_driver_modules_definition_file_system" ON "driver_modules" ("definition_system_id", "file_system_id") `,
    );
    await queryRunner.query(
      `DROP INDEX "idx_vcpm_module_attributes_vcpm_module_def_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vcpm_module_attributes" RENAME TO "temporary_vcpm_module_attributes"`,
    );
    await queryRunner.query(
      `CREATE TABLE "vcpm_module_attributes" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "name" varchar(255) NOT NULL, "value" varchar(500) NOT NULL, "vcpm_module_definition_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "vcpm_module_attributes"("system_id", "created_at", "updated_at", "version", "name", "value", "vcpm_module_definition_system_id") SELECT "system_id", "created_at", "updated_at", "version", "name", "value", "vcpm_module_definition_system_id" FROM "temporary_vcpm_module_attributes"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_vcpm_module_attributes"`);
    await queryRunner.query(
      `CREATE INDEX "idx_vcpm_module_attributes_vcpm_module_def_id" ON "vcpm_module_attributes" ("vcpm_module_definition_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "idx_tag_key_def_links_tag_def_id"`);
    await queryRunner.query(
      `ALTER TABLE "tag_key_def_links" RENAME TO "temporary_tag_key_def_links"`,
    );
    await queryRunner.query(
      `CREATE TABLE "tag_key_def_links" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "tag_definition_system_id" integer NOT NULL, "key_reference_system_id" integer NOT NULL, "tag_enum_value" text)`,
    );
    await queryRunner.query(
      `INSERT INTO "tag_key_def_links"("system_id", "created_at", "updated_at", "version", "tag_definition_system_id", "key_reference_system_id", "tag_enum_value") SELECT "system_id", "created_at", "updated_at", "version", "tag_definition_system_id", "key_reference_system_id", "tag_enum_value" FROM "temporary_tag_key_def_links"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_tag_key_def_links"`);
    await queryRunner.query(
      `CREATE INDEX "idx_tag_key_def_links_tag_def_id" ON "tag_key_def_links" ("tag_definition_system_id") `,
    );
    await queryRunner.query(
      `DROP INDEX "idx_module_param_defs_vcpm_module_def_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vcpm_module_parameter_definitions" RENAME TO "temporary_vcpm_module_parameter_definitions"`,
    );
    await queryRunner.query(
      `CREATE TABLE "vcpm_module_parameter_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "param_id" integer NOT NULL, "name" varchar(255), "description" text, "max_size" integer NOT NULL, "pid_type" varchar(100) NOT NULL, "is_persistent" boolean NOT NULL, "is_read_only" boolean NOT NULL, "tool_policies" text, "elements_structure" text, "vcpm_module_definition_system_id" integer)`,
    );
    await queryRunner.query(
      `INSERT INTO "vcpm_module_parameter_definitions"("system_id", "created_at", "updated_at", "version", "param_id", "name", "description", "max_size", "pid_type", "is_persistent", "is_read_only", "tool_policies", "elements_structure", "vcpm_module_definition_system_id") SELECT "system_id", "created_at", "updated_at", "version", "param_id", "name", "description", "max_size", "pid_type", "is_persistent", "is_read_only", "tool_policies", "elements_structure", "vcpm_module_definition_system_id" FROM "temporary_vcpm_module_parameter_definitions"`,
    );
    await queryRunner.query(
      `DROP TABLE "temporary_vcpm_module_parameter_definitions"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_module_param_defs_vcpm_module_def_id" ON "vcpm_module_parameter_definitions" ("vcpm_module_definition_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "idx_static_intent_defs_port_id"`);
    await queryRunner.query(
      `ALTER TABLE "static_intent_definitions" RENAME TO "temporary_static_intent_definitions"`,
    );
    await queryRunner.query(
      `CREATE TABLE "static_intent_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "intent_id" integer NOT NULL, "name" varchar(255), "static_control_port_defition_system_id" integer NOT NULL, "static_control_port_definition_system_id" integer)`,
    );
    await queryRunner.query(
      `INSERT INTO "static_intent_definitions"("system_id", "created_at", "updated_at", "version", "intent_id", "name", "static_control_port_defition_system_id", "static_control_port_definition_system_id") SELECT "system_id", "created_at", "updated_at", "version", "intent_id", "name", "static_control_port_defition_system_id", "static_control_port_definition_system_id" FROM "temporary_static_intent_definitions"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_static_intent_definitions"`);
    await queryRunner.query(
      `CREATE INDEX "idx_static_intent_defs_port_id" ON "static_intent_definitions" ("static_control_port_defition_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "idx_static_ports_module_def_id"`);
    await queryRunner.query(
      `ALTER TABLE "static_control_port_definitions" RENAME TO "temporary_static_control_port_definitions"`,
    );
    await queryRunner.query(
      `CREATE TABLE "static_control_port_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "port_id" integer NOT NULL, "port_name" varchar(255), "module_definition_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "static_control_port_definitions"("system_id", "created_at", "updated_at", "version", "port_id", "port_name", "module_definition_system_id") SELECT "system_id", "created_at", "updated_at", "version", "port_id", "port_name", "module_definition_system_id" FROM "temporary_static_control_port_definitions"`,
    );
    await queryRunner.query(
      `DROP TABLE "temporary_static_control_port_definitions"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_static_ports_module_def_id" ON "static_control_port_definitions" ("module_definition_system_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "module_definition_container_types" RENAME TO "temporary_module_definition_container_types"`,
    );
    await queryRunner.query(
      `CREATE TABLE "module_definition_container_types" ("module_definition_system_id" integer NOT NULL, "container_type_system_id" integer NOT NULL, PRIMARY KEY ("module_definition_system_id", "container_type_system_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "module_definition_container_types"("module_definition_system_id", "container_type_system_id") SELECT "module_definition_system_id", "container_type_system_id" FROM "temporary_module_definition_container_types"`,
    );
    await queryRunner.query(
      `DROP TABLE "temporary_module_definition_container_types"`,
    );
    await queryRunner.query(
      `ALTER TABLE "module_definition_processor_definitions" RENAME TO "temporary_module_definition_processor_definitions"`,
    );
    await queryRunner.query(
      `CREATE TABLE "module_definition_processor_definitions" ("module_definition_system_id" integer NOT NULL, "processor_definition_system_id" integer NOT NULL, PRIMARY KEY ("module_definition_system_id", "processor_definition_system_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "module_definition_processor_definitions"("module_definition_system_id", "processor_definition_system_id") SELECT "module_definition_system_id", "processor_definition_system_id" FROM "temporary_module_definition_processor_definitions"`,
    );
    await queryRunner.query(
      `DROP TABLE "temporary_module_definition_processor_definitions"`,
    );
    await queryRunner.query(
      `DROP INDEX "idx_module_param_defs_spf_module_def_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "spf_module_parameter_definitions" RENAME TO "temporary_spf_module_parameter_definitions"`,
    );
    await queryRunner.query(
      `CREATE TABLE "spf_module_parameter_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "param_id" integer NOT NULL, "name" varchar(255), "description" text, "max_size" integer NOT NULL, "pid_type" varchar(100) NOT NULL, "is_persistent" boolean NOT NULL, "elements_structure" text, "is_read_only" boolean NOT NULL, "tool_policies" text, "spf_module_definition_system_id" integer)`,
    );
    await queryRunner.query(
      `INSERT INTO "spf_module_parameter_definitions"("system_id", "created_at", "updated_at", "version", "param_id", "name", "description", "max_size", "pid_type", "is_persistent", "elements_structure", "is_read_only", "tool_policies", "spf_module_definition_system_id") SELECT "system_id", "created_at", "updated_at", "version", "param_id", "name", "description", "max_size", "pid_type", "is_persistent", "elements_structure", "is_read_only", "tool_policies", "spf_module_definition_system_id" FROM "temporary_spf_module_parameter_definitions"`,
    );
    await queryRunner.query(
      `DROP TABLE "temporary_spf_module_parameter_definitions"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_module_param_defs_spf_module_def_id" ON "spf_module_parameter_definitions" ("spf_module_definition_system_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "spf_module_definitions" RENAME TO "temporary_spf_module_definitions"`,
    );
    await queryRunner.query(
      `CREATE TABLE "spf_module_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "module_definition_id" integer NOT NULL, "name" varchar(255) NOT NULL, "display_name" varchar(255), "description" text, "group_name" varchar(255), "mod_search_keys" text, "stack_size" integer NOT NULL DEFAULT (0), "file_system_id" integer NOT NULL, "metadata" text, "is_loaded_at_bootup" boolean NOT NULL DEFAULT (0), "module_definition_system_id" integer, CONSTRAINT "REL_e5a9714fba21e5202c09bcfb7e" UNIQUE ("module_definition_system_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "spf_module_definitions"("system_id", "created_at", "updated_at", "version", "module_definition_id", "name", "display_name", "description", "group_name", "mod_search_keys", "stack_size", "file_system_id", "metadata", "is_loaded_at_bootup", "module_definition_system_id") SELECT "system_id", "created_at", "updated_at", "version", "module_definition_id", "name", "display_name", "description", "group_name", "mod_search_keys", "stack_size", "file_system_id", "metadata", "is_loaded_at_bootup", "module_definition_system_id" FROM "temporary_spf_module_definitions"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_spf_module_definitions"`);
    await queryRunner.query(
      `ALTER TABLE "module_parameter_attributes" RENAME TO "temporary_module_parameter_attributes"`,
    );
    await queryRunner.query(
      `CREATE TABLE "module_parameter_attributes" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "name" varchar(255) NOT NULL, "value" text NOT NULL, "module_parameter_definition_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "module_parameter_attributes"("system_id", "created_at", "updated_at", "version", "name", "value", "module_parameter_definition_system_id") SELECT "system_id", "created_at", "updated_at", "version", "name", "value", "module_parameter_definition_system_id" FROM "temporary_module_parameter_attributes"`,
    );
    await queryRunner.query(
      `DROP TABLE "temporary_module_parameter_attributes"`,
    );
    await queryRunner.query(`DROP INDEX "idx_module_def_meta_module_def_id"`);
    await queryRunner.query(
      `ALTER TABLE "module_definition_meta_data" RENAME TO "temporary_module_definition_meta_data"`,
    );
    await queryRunner.query(
      `CREATE TABLE "module_definition_meta_data" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "value" text, "module_definition_system_id" integer NOT NULL, CONSTRAINT "REL_2118ef6e7df7c8a4005051c62a" UNIQUE ("module_definition_system_id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "module_definition_meta_data"("system_id", "created_at", "updated_at", "version", "value", "module_definition_system_id") SELECT "system_id", "created_at", "updated_at", "version", "value", "module_definition_system_id" FROM "temporary_module_definition_meta_data"`,
    );
    await queryRunner.query(
      `DROP TABLE "temporary_module_definition_meta_data"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_module_def_meta_module_def_id" ON "module_definition_meta_data" ("module_definition_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "idx_module_attributes_module_def_id"`);
    await queryRunner.query(
      `ALTER TABLE "module_attributes" RENAME TO "temporary_module_attributes"`,
    );
    await queryRunner.query(
      `CREATE TABLE "module_attributes" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "name" varchar(255) NOT NULL, "value" varchar(500) NOT NULL, "module_definition_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "module_attributes"("system_id", "created_at", "updated_at", "version", "name", "value", "module_definition_system_id") SELECT "system_id", "created_at", "updated_at", "version", "name", "value", "module_definition_system_id" FROM "temporary_module_attributes"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_module_attributes"`);
    await queryRunner.query(
      `CREATE INDEX "idx_module_attributes_module_def_id" ON "module_attributes" ("module_definition_system_id") `,
    );
    await queryRunner.query(
      `DROP INDEX "idx_dynamic_intent_defs_module_def_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dynamic_intent_definitions" RENAME TO "temporary_dynamic_intent_definitions"`,
    );
    await queryRunner.query(
      `CREATE TABLE "dynamic_intent_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "intent_id" integer NOT NULL, "name" varchar(255), "max_port" integer, "module_definition_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "dynamic_intent_definitions"("system_id", "created_at", "updated_at", "version", "intent_id", "name", "max_port", "module_definition_system_id") SELECT "system_id", "created_at", "updated_at", "version", "intent_id", "name", "max_port", "module_definition_system_id" FROM "temporary_dynamic_intent_definitions"`,
    );
    await queryRunner.query(
      `DROP TABLE "temporary_dynamic_intent_definitions"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_dynamic_intent_defs_module_def_id" ON "dynamic_intent_definitions" ("module_definition_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "idx_data_port_definitions_group_id"`);
    await queryRunner.query(
      `ALTER TABLE "data_port_definitions" RENAME TO "temporary_data_port_definitions"`,
    );
    await queryRunner.query(
      `CREATE TABLE "data_port_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "data_port_id" integer NOT NULL, "name" varchar(255), "data_port_group_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "data_port_definitions"("system_id", "created_at", "updated_at", "version", "data_port_id", "name", "data_port_group_system_id") SELECT "system_id", "created_at", "updated_at", "version", "data_port_id", "name", "data_port_group_system_id" FROM "temporary_data_port_definitions"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_data_port_definitions"`);
    await queryRunner.query(
      `CREATE INDEX "idx_data_port_definitions_group_id" ON "data_port_definitions" ("data_port_group_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "idx_data_port_groups_module_def_id"`);
    await queryRunner.query(
      `ALTER TABLE "data_port_groups" RENAME TO "temporary_data_port_groups"`,
    );
    await queryRunner.query(
      `CREATE TABLE "data_port_groups" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "max_allowed_port_count" integer NOT NULL DEFAULT (0), "port_io_type" varchar CHECK( "port_io_type" IN ('INPUT','OUTPUT','INPUT_OUTPUT','OUTPUT_INPUT') ) NOT NULL, "module_definition_system_id" integer NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "data_port_groups"("system_id", "created_at", "updated_at", "version", "max_allowed_port_count", "port_io_type", "module_definition_system_id") SELECT "system_id", "created_at", "updated_at", "version", "max_allowed_port_count", "port_io_type", "module_definition_system_id" FROM "temporary_data_port_groups"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_data_port_groups"`);
    await queryRunner.query(
      `CREATE INDEX "idx_data_port_groups_module_def_id" ON "data_port_groups" ("module_definition_system_id") `,
    );
    await queryRunner.query(
      `DROP INDEX "idx_module_param_defs_driver_module_def_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_module_parameter_definitions" RENAME TO "temporary_driver_module_parameter_definitions"`,
    );
    await queryRunner.query(
      `CREATE TABLE "driver_module_parameter_definitions" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "parameter_id" integer NOT NULL, "name" varchar(255), "description" text, "max_size" integer NOT NULL, "param_structure" text NOT NULL, "driver_module_definition_system_id" integer)`,
    );
    await queryRunner.query(
      `INSERT INTO "driver_module_parameter_definitions"("system_id", "created_at", "updated_at", "version", "parameter_id", "name", "description", "max_size", "param_structure", "driver_module_definition_system_id") SELECT "system_id", "created_at", "updated_at", "version", "parameter_id", "name", "description", "max_size", "param_structure", "driver_module_definition_system_id" FROM "temporary_driver_module_parameter_definitions"`,
    );
    await queryRunner.query(
      `DROP TABLE "temporary_driver_module_parameter_definitions"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_module_param_defs_driver_module_def_id" ON "driver_module_parameter_definitions" ("driver_module_definition_system_id") `,
    );
    await queryRunner.query(`DROP INDEX "idx_arc_values_keys_system_id"`);
    await queryRunner.query(
      `ALTER TABLE "arc_values" RENAME TO "temporary_arc_values"`,
    );
    await queryRunner.query(
      `CREATE TABLE "arc_values" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "value_id" integer NOT NULL, "keys_system_id" integer NOT NULL, "name" text NOT NULL, "enum_value" text, "special_value" text, "description" text)`,
    );
    await queryRunner.query(
      `INSERT INTO "arc_values"("system_id", "created_at", "updated_at", "version", "value_id", "keys_system_id", "name", "enum_value", "special_value", "description") SELECT "system_id", "created_at", "updated_at", "version", "value_id", "keys_system_id", "name", "enum_value", "special_value", "description" FROM "temporary_arc_values"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_arc_values"`);
    await queryRunner.query(
      `CREATE INDEX "idx_arc_values_keys_system_id" ON "arc_values" ("keys_system_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "arc_keys" RENAME TO "temporary_arc_keys"`,
    );
    await queryRunner.query(
      `CREATE TABLE "arc_keys" ("system_id" integer PRIMARY KEY NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "file_system_id" integer NOT NULL, "key_id" integer NOT NULL, "name" text NOT NULL, "key_enum_name" text, "key_enum_value" text, "description" text, "is_voice" boolean, "is_dynamic" boolean, "is_calibration_key" boolean, "is_graph_key" boolean, "speciality_key_value" text, "calibration_enum_value" text, "graph_enum_value" text)`,
    );
    await queryRunner.query(
      `INSERT INTO "arc_keys"("system_id", "created_at", "updated_at", "version", "file_system_id", "key_id", "name", "key_enum_name", "key_enum_value", "description", "is_voice", "is_dynamic", "is_calibration_key", "is_graph_key", "speciality_key_value", "calibration_enum_value", "graph_enum_value") SELECT "system_id", "created_at", "updated_at", "version", "file_system_id", "key_id", "name", "key_enum_name", "key_enum_value", "description", "is_voice", "is_dynamic", "is_calibration_key", "is_graph_key", "speciality_key_value", "calibration_enum_value", "graph_enum_value" FROM "temporary_arc_keys"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_arc_keys"`);
    await queryRunner.query(`DROP INDEX "IDX_943c72ed8170978a8c8402bdc1"`);
    await queryRunner.query(`DROP INDEX "IDX_65e66135d222dfa6dc5fe528e6"`);
    await queryRunner.query(`DROP INDEX "IDX_06f2962641e6632eb9a7ac63da"`);
    await queryRunner.query(`DROP INDEX "IDX_d5b97ccc404cecb9166a453280"`);
    await queryRunner.query(`DROP TABLE "use_case_categories"`);
    await queryRunner.query(`DROP TABLE "validation_preferences"`);
    await queryRunner.query(`DROP INDEX "idx_session_commits_session"`);
    await queryRunner.query(`DROP TABLE "session_commits"`);
    await queryRunner.query(
      `DROP INDEX "uq_project_sessions_one_active_per_file"`,
    );
    await queryRunner.query(`DROP INDEX "idx_project_sessions_status"`);
    await queryRunner.query(`DROP INDEX "idx_project_sessions_file"`);
    await queryRunner.query(`DROP TABLE "project_sessions"`);
    await queryRunner.query(`DROP INDEX "idx_restore_points_file"`);
    await queryRunner.query(`DROP INDEX "idx_restore_points_session"`);
    await queryRunner.query(`DROP TABLE "restore_points"`);
    await queryRunner.query(`DROP INDEX "uniq_edit_actions_current"`);
    await queryRunner.query(`DROP INDEX "idx_edit_actions_status_active"`);
    await queryRunner.query(`DROP INDEX "idx_edit_actions_agg_active"`);
    await queryRunner.query(`DROP INDEX "idx_edit_actions_table_active"`);
    await queryRunner.query(`DROP INDEX "idx_edit_actions_entity_active"`);
    await queryRunner.query(`DROP INDEX "idx_edit_actions_session"`);
    await queryRunner.query(`DROP TABLE "edit_actions"`);
    await queryRunner.query(`DROP INDEX "idx_use_case_subgraph_pairs_sgs"`);
    await queryRunner.query(`DROP TABLE "use_case_subgraph_pairs"`);
    await queryRunner.query(`DROP INDEX "idx_use_case_subgraphs_subgraph"`);
    await queryRunner.query(`DROP TABLE "use_case_subgraphs"`);
    await queryRunner.query(`DROP TABLE "usecase_gkv_values"`);
    await queryRunner.query(`DROP TABLE "use_case_categories_master"`);
    await queryRunner.query(`DROP INDEX "ix_use_case_file"`);
    await queryRunner.query(`DROP INDEX "ix_use_case_alias"`);
    await queryRunner.query(`DROP TABLE "use_cases"`);
    await queryRunner.query(`DROP TABLE "subsystems"`);
    await queryRunner.query(`DROP TABLE "sgkv_values"`);
    await queryRunner.query(`DROP TABLE "sgkv"`);
    await queryRunner.query(
      `DROP INDEX "uq_subgraphs_subgraph_id_file_system_id"`,
    );
    await queryRunner.query(`DROP INDEX "uq_subgraphs_name_file_system_id"`);
    await queryRunner.query(`DROP TABLE "subgraphs"`);
    await queryRunner.query(`DROP TABLE "vcpm_ckv_values"`);
    await queryRunner.query(`DROP INDEX "uk_vcpm_parameter_payload"`);
    await queryRunner.query(`DROP TABLE "vcpm_parameter_payload"`);
    await queryRunner.query(`DROP TABLE "vcpm_ckv"`);
    await queryRunner.query(
      `DROP INDEX "uk_vcpm_instance_subgraph_definition"`,
    );
    await queryRunner.query(`DROP TABLE "vcpm_instances"`);
    await queryRunner.query(`DROP INDEX "uk_subgraph_property_data"`);
    await queryRunner.query(`DROP TABLE "subgraph_property_data"`);
    await queryRunner.query(`DROP TABLE "nodes"`);
    await queryRunner.query(`DROP TABLE "data_ports"`);
    await queryRunner.query(`DROP INDEX "uk_intent_control_port_intent"`);
    await queryRunner.query(`DROP TABLE "intents"`);
    await queryRunner.query(`DROP INDEX "uk_control_port_node_port"`);
    await queryRunner.query(`DROP TABLE "control_ports"`);
    await queryRunner.query(
      `DROP INDEX "uq_spf_modules_instance_id_file_system_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "ix_spf_modules_definition_file_system"`,
    );
    await queryRunner.query(
      `DROP INDEX "ix_spf_modules_container_file_system"`,
    );
    await queryRunner.query(`DROP INDEX "ix_spf_modules_subgraph_file_system"`);
    await queryRunner.query(`DROP TABLE "spf_modules"`);
    await queryRunner.query(`DROP TABLE "tkv_values"`);
    await queryRunner.query(`DROP INDEX "ix_tkv_parameter"`);
    await queryRunner.query(`DROP TABLE "tkv_parameter_payload"`);
    await queryRunner.query(`DROP TABLE "tkv"`);
    await queryRunner.query(`DROP INDEX "ix_module_tag_definition"`);
    await queryRunner.query(`DROP TABLE "module_tag_id_map"`);
    await queryRunner.query(`DROP INDEX "uk_spf_module_properties_data"`);
    await queryRunner.query(`DROP TABLE "spf_module_properties_data"`);
    await queryRunner.query(`DROP TABLE "ckv_values"`);
    await queryRunner.query(`DROP INDEX "ix_ckv_parameter"`);
    await queryRunner.query(`DROP TABLE "ckv_parameter_payload"`);
    await queryRunner.query(`DROP TABLE "ckv"`);
    await queryRunner.query(`DROP INDEX "idx_sls_dst_port_file"`);
    await queryRunner.query(`DROP INDEX "idx_sls_src_port_file"`);
    await queryRunner.query(`DROP INDEX "idx_sls_data_link"`);
    await queryRunner.query(`DROP INDEX "idx_sls_file"`);
    await queryRunner.query(`DROP TABLE "subsystem_data_links"`);
    await queryRunner.query(`DROP INDEX "idx_data_links_dst_sg"`);
    await queryRunner.query(`DROP INDEX "idx_data_links_src_sg_scope"`);
    await queryRunner.query(`DROP INDEX "uk_data_link_ports"`);
    await queryRunner.query(`DROP TABLE "data_links"`);
    await queryRunner.query(`DROP INDEX "idx_control_links_dst_sg"`);
    await queryRunner.query(`DROP INDEX "idx_control_links_src_sg_scope"`);
    await queryRunner.query(`DROP INDEX "uk_control_link_unique"`);
    await queryRunner.query(`DROP TABLE "control_links"`);
    await queryRunner.query(
      `DROP INDEX "uq_containers_container_id_file_system_id"`,
    );
    await queryRunner.query(`DROP TABLE "containers"`);
    await queryRunner.query(`DROP INDEX "uk_container_property_data"`);
    await queryRunner.query(`DROP TABLE "container_property_data"`);
    await queryRunner.query(`DROP INDEX "uk_configuration_file"`);
    await queryRunner.query(`DROP TABLE "configuration"`);
    await queryRunner.query(`DROP INDEX "uk_projects_name"`);
    await queryRunner.query(`DROP TABLE "projects"`);
    await queryRunner.query(`DROP INDEX "uk_files_project_filename"`);
    await queryRunner.query(`DROP TABLE "files"`);
    await queryRunner.query(
      `DROP INDEX "uq_module_manager_data_processor_module"`,
    );
    await queryRunner.query(`DROP TABLE "module_manager_data"`);
    await queryRunner.query(`DROP TABLE "dkv_values"`);
    await queryRunner.query(`DROP INDEX "uk_dkv_parameter_payload"`);
    await queryRunner.query(`DROP TABLE "dkv_parameter_payload"`);
    await queryRunner.query(`DROP TABLE "dkv"`);
    await queryRunner.query(
      `DROP INDEX "uq_driver_modules_definition_system_id_file_system_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "ix_driver_modules_definition_file_system"`,
    );
    await queryRunner.query(`DROP TABLE "driver_modules"`);
    await queryRunner.query(
      `DROP INDEX "idx_vcpm_module_attributes_vcpm_module_def_id"`,
    );
    await queryRunner.query(`DROP TABLE "vcpm_module_attributes"`);
    await queryRunner.query(`DROP INDEX "idx_tag_key_def_links_tag_def_id"`);
    await queryRunner.query(`DROP TABLE "tag_key_def_links"`);
    await queryRunner.query(`DROP TABLE "tag_definitions"`);
    await queryRunner.query(
      `DROP INDEX "idx_module_param_defs_vcpm_module_def_id"`,
    );
    await queryRunner.query(`DROP TABLE "vcpm_module_parameter_definitions"`);
    await queryRunner.query(`DROP TABLE "vcpm_module_definitions"`);
    await queryRunner.query(`DROP TABLE "subgraph_property_definitions"`);
    await queryRunner.query(`DROP INDEX "idx_static_intent_defs_port_id"`);
    await queryRunner.query(`DROP TABLE "static_intent_definitions"`);
    await queryRunner.query(`DROP INDEX "idx_static_ports_module_def_id"`);
    await queryRunner.query(`DROP TABLE "static_control_port_definitions"`);
    await queryRunner.query(`DROP TABLE "module_definition_container_types"`);
    await queryRunner.query(
      `DROP TABLE "module_definition_processor_definitions"`,
    );
    await queryRunner.query(
      `DROP INDEX "idx_module_param_defs_spf_module_def_id"`,
    );
    await queryRunner.query(`DROP TABLE "spf_module_parameter_definitions"`);
    await queryRunner.query(`DROP TABLE "spf_module_definitions"`);
    await queryRunner.query(`DROP TABLE "module_property_definitions"`);
    await queryRunner.query(`DROP TABLE "module_parameter_attributes"`);
    await queryRunner.query(`DROP INDEX "idx_module_def_meta_module_def_id"`);
    await queryRunner.query(`DROP TABLE "module_definition_meta_data"`);
    await queryRunner.query(`DROP INDEX "idx_module_attributes_module_def_id"`);
    await queryRunner.query(`DROP TABLE "module_attributes"`);
    await queryRunner.query(
      `DROP INDEX "idx_dynamic_intent_defs_module_def_id"`,
    );
    await queryRunner.query(`DROP TABLE "dynamic_intent_definitions"`);
    await queryRunner.query(`DROP INDEX "idx_data_port_definitions_group_id"`);
    await queryRunner.query(`DROP TABLE "data_port_definitions"`);
    await queryRunner.query(`DROP INDEX "idx_data_port_groups_module_def_id"`);
    await queryRunner.query(`DROP TABLE "data_port_groups"`);
    await queryRunner.query(
      `DROP INDEX "idx_module_param_defs_driver_module_def_id"`,
    );
    await queryRunner.query(`DROP TABLE "driver_module_parameter_definitions"`);
    await queryRunner.query(`DROP TABLE "driver_module_definitions"`);
    await queryRunner.query(`DROP INDEX "idx_arc_values_keys_system_id"`);
    await queryRunner.query(`DROP TABLE "arc_values"`);
    await queryRunner.query(`DROP TABLE "arc_keys"`);
    await queryRunner.query(`DROP TABLE "container_property_definitions"`);
    await queryRunner.query(`DROP TABLE "container_types"`);
    await queryRunner.query(`DROP TABLE "processor_definitions"`);
  }
}
