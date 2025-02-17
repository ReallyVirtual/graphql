/*
 * Copyright (c) "Neo4j"
 * Neo4j Sweden AB [http://neo4j.com]
 *
 * This file is part of Neo4j.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { Directive, InputTypeComposer, SchemaComposer } from "graphql-compose";
import { InterfaceTypeComposer, ObjectTypeComposer } from "graphql-compose";
import type { Node } from "../../classes";
import type { Subgraph } from "../../classes/Subgraph";
import { RelationshipNestedOperationsOption } from "../../constants";
import type { RelationField } from "../../types";
import { upperFirst } from "../../utils/upper-first";
import { FieldAggregationComposer } from "../aggregations/field-aggregation-composer";
import { addRelationshipArrayFilters } from "../augment/add-relationship-array-filters";
import { addDirectedArgument } from "../directed-argument";
import type { ObjectFields } from "../get-obj-field-meta";
import { graphqlDirectivesToCompose } from "../to-compose";
import { createAggregationInputFields } from "./create-aggregation-input-fields";
import { createConnectOrCreateField } from "./create-connect-or-create-field";
import { createRelationshipInterfaceFields } from "./create-relationship-interface-fields";
import { createRelationshipUnionFields } from "./create-relationship-union-fields";
import { createTopLevelConnectOrCreateInput } from "./create-top-level-connect-or-create-input";
import { overwrite } from "./fields/overwrite";
import { inspectObjectFields } from "./inspect-object-fields";

interface CreateRelationshipFieldsArgs {
    relationshipFields: RelationField[];
    schemaComposer: SchemaComposer;
    composeNode: ObjectTypeComposer | InterfaceTypeComposer;
    sourceName: string;
    nodes: Node[];
    relationshipPropertyFields: Map<string, ObjectFields>;
    subgraph?: Subgraph;
}

function createRelationshipFields({
    relationshipFields,
    schemaComposer,
    // TODO: Ideally we come up with a solution where we don't have to pass the following into these kind of functions
    composeNode,
    sourceName,
    nodes,
    relationshipPropertyFields,
    subgraph,
}: CreateRelationshipFieldsArgs): void {
    if (!relationshipFields.length) {
        return;
    }

    relationshipFields.forEach((rel) => {
        const relFields = relationshipPropertyFields.get(rel.properties || "");

        const { hasNonGeneratedProperties, anyNonNullRelProperties, hasNonNullNonGeneratedProperties } =
            inspectObjectFields(relFields);

        if (rel.interface) {
            createRelationshipInterfaceFields({
                nodes,
                rel,
                composeNode,
                schemaComposer,
                sourceName,
                hasNonGeneratedProperties,
                anyNonNullRelProperties,
            });

            return;
        }

        if (rel.union) {
            createRelationshipUnionFields({
                nodes,
                rel,
                composeNode,
                sourceName,
                schemaComposer,
                hasNonGeneratedProperties,
                hasNonNullNonGeneratedProperties,
            });

            return;
        }

        const node = nodes.find((x) => x.name === rel.typeMeta.name);
        if (!node) {
            return;
        }

        const deprecatedDirectives = graphqlDirectivesToCompose(
            rel.otherDirectives.filter((directive) => directive.name.value === "deprecated")
        );
        const nestedOperations = new Set(rel.nestedOperations);
        const nodeCreateInput = schemaComposer.getITC(`${sourceName}CreateInput`);
        const nodeUpdateInput = schemaComposer.getITC(`${sourceName}UpdateInput`);
        const upperFieldName = upperFirst(rel.fieldName);
        const relationshipWhereTypeInputName = `${sourceName}${upperFieldName}AggregateInput`;

        // Don't generate empty input type
        let nodeFieldInput: InputTypeComposer<any> | undefined;
        if (
            nestedOperations.has(RelationshipNestedOperationsOption.CONNECT) ||
            nestedOperations.has(RelationshipNestedOperationsOption.CREATE) ||
            // The connectOrCreate field is not generated if the related type does not have a unique field
            (nestedOperations.has(RelationshipNestedOperationsOption.CONNECT_OR_CREATE) && node.uniqueFields.length)
        ) {
            const nodeFieldInputName = `${rel.connectionPrefix}${upperFieldName}FieldInput`;
            nodeFieldInput = schemaComposer.getOrCreateITC(nodeFieldInputName);
        }
        // Don't generate an empty input type
        let nodeFieldUpdateInput: InputTypeComposer<any> | undefined;
        // If the only nestedOperation is connectOrCreate, it won't be generated if there are no unique fields on the related type
        const onlyConnectOrCreateAndNoUniqueFields =
            nestedOperations.size === 1 &&
            nestedOperations.has(RelationshipNestedOperationsOption.CONNECT_OR_CREATE) &&
            !node.uniqueFields.length;

        if (nestedOperations.size !== 0 && !onlyConnectOrCreateAndNoUniqueFields) {
            const nodeFieldUpdateInputName = `${rel.connectionPrefix}${upperFieldName}UpdateFieldInput`;
            nodeFieldUpdateInput = schemaComposer.getOrCreateITC(nodeFieldUpdateInputName);
            // Add where fields
            nodeFieldUpdateInput.addFields({
                where: `${rel.connectionPrefix}${upperFieldName}ConnectionWhere`,
            });
        }

        const nodeWhereAggregationInput = createAggregationInputFields(node, sourceName, rel, schemaComposer);
        const edgeWhereAggregationInput =
            relFields && createAggregationInputFields(relFields, sourceName, rel, schemaComposer);

        const whereAggregateInput = schemaComposer.getOrCreateITC(relationshipWhereTypeInputName, (tc) => {
            tc.addFields({
                count: "Int",
                count_LT: "Int",
                count_LTE: "Int",
                count_GT: "Int",
                count_GTE: "Int",
                AND: `[${relationshipWhereTypeInputName}!]`,
                OR: `[${relationshipWhereTypeInputName}!]`,
                NOT: relationshipWhereTypeInputName,
            });

            if (nodeWhereAggregationInput) {
                tc.addFields({
                    node: nodeWhereAggregationInput,
                });
            }

            if (edgeWhereAggregationInput) {
                tc.addFields({
                    edge: edgeWhereAggregationInput,
                });
            }
        });

        const whereInput = schemaComposer.getITC(`${sourceName}Where`);
        if (rel.filterableOptions.byValue) {
            whereInput.addFields({
                [rel.fieldName]: {
                    type: `${node.name}Where`,
                },
                [`${rel.fieldName}_NOT`]: {
                    type: `${node.name}Where`,
                },
            });
        }

        if (rel.filterableOptions.byAggregate) {
            whereInput.addFields({
                [`${rel.fieldName}Aggregate`]: {
                    type: whereAggregateInput,
                    directives: deprecatedDirectives,
                },
            });
        }
    
        // n..m Relationships
        if (rel.typeMeta.array && rel.filterableOptions.byValue) {
            addRelationshipArrayFilters({
                whereInput,
                fieldName: rel.fieldName,
                sourceName,
                relatedType: rel.typeMeta.name,
                whereType: `${node.name}Where`,
                directives: deprecatedDirectives,
            });
        }

        if (!rel.writeonly) {
            const relationshipField: { type: string; description?: string; directives: Directive[]; args?: any } = {
                type: rel.typeMeta.pretty,
                description: rel.description,
                directives: graphqlDirectivesToCompose(rel.otherDirectives),
            };

            let generateRelFieldArgs = true;

            // Subgraph schemas do not support arguments on relationship fields (singular)
            if (subgraph) {
                if (!rel.typeMeta.array) {
                    generateRelFieldArgs = false;
                }
            }

            if (generateRelFieldArgs) {
                const nodeFieldsBaseArgs = {
                    where: `${rel.typeMeta.name}Where`,
                    options: `${rel.typeMeta.name}Options`,
                };
                const nodeFieldsArgs = addDirectedArgument(nodeFieldsBaseArgs, rel);
                relationshipField.args = nodeFieldsArgs;
            }

            if (rel.selectableOptions.onRead) {
                composeNode.addFields({
                    [rel.fieldName]: relationshipField,
                });
            }

            if (composeNode instanceof ObjectTypeComposer) {
                const baseTypeName = `${sourceName}${node.name}${upperFieldName}`;
                const fieldAggregationComposer = new FieldAggregationComposer(schemaComposer, subgraph);

                const aggregationTypeObject = fieldAggregationComposer.createAggregationTypeObject(
                    baseTypeName,
                    node,
                    relFields
                );

                const aggregationFieldsBaseArgs = {
                    where: `${rel.typeMeta.name}Where`,
                };

                const aggregationFieldsArgs = addDirectedArgument(aggregationFieldsBaseArgs, rel);

                if (rel.aggregate) {
                    composeNode.addFields({
                        [`${rel.fieldName}Aggregate`]: {
                            type: aggregationTypeObject,
                            args: aggregationFieldsArgs,
                            directives: deprecatedDirectives,
                        },
                    });
                }
            }
        }

        if (rel.settableOptions.onCreate) {
            // Interface CreateInput does not require relationship input fields
            // These are specified on the concrete nodes.
            if (!(composeNode instanceof InterfaceTypeComposer) && nodeFieldInput) {
                nodeCreateInput.addFields({
                    [rel.fieldName]: {
                        type: nodeFieldInput,
                        directives: deprecatedDirectives,
                    },
                });
            }
        }

        if (
            nestedOperations.has(RelationshipNestedOperationsOption.CONNECT_OR_CREATE) &&
            (nodeFieldInput || nodeFieldUpdateInput)
        ) {
            // createConnectOrCreateField return undefined if the node has no uniqueFields
            const connectOrCreate = createConnectOrCreateField({
                relationField: rel,
                node,
                schemaComposer,
                hasNonGeneratedProperties,
                hasNonNullNonGeneratedProperties,
            });

            if (connectOrCreate) {
                if (nodeFieldUpdateInput) {
                    nodeFieldUpdateInput.addFields({
                        connectOrCreate,
                    });
                }

                if (nodeFieldInput) {
                    nodeFieldInput.addFields({
                        connectOrCreate,
                    });
                }

                createTopLevelConnectOrCreateInput({ schemaComposer, sourceName, rel });
            }
        }

        if (
            nestedOperations.has(RelationshipNestedOperationsOption.CREATE) &&
            (nodeFieldInput || nodeFieldUpdateInput)
        ) {
            const createName = `${rel.connectionPrefix}${upperFieldName}CreateFieldInput`;
            const create = rel.typeMeta.array ? `[${createName}!]` : createName;
            schemaComposer.getOrCreateITC(createName, (tc) => {
                tc.addFields({ node: `${node.name}CreateInput!` });
                if (hasNonGeneratedProperties) {
                    tc.addFields({
                        edge: `${rel.properties}CreateInput${hasNonNullNonGeneratedProperties ? `!` : ""}`,
                    });
                }
            });

            if (nodeFieldUpdateInput) {
                nodeFieldUpdateInput.addFields({
                    create,
                });
            }

            if (nodeFieldInput) {
                nodeFieldInput.addFields({
                    create,
                });
            }

            const nodeRelationInput = schemaComposer.getOrCreateITC(`${sourceName}RelationInput`);
            nodeRelationInput.addFields({
                [rel.fieldName]: {
                    type: create,
                    directives: deprecatedDirectives,
                },
            });
        }

        if (
            nestedOperations.has(RelationshipNestedOperationsOption.CONNECT) &&
            (nodeFieldInput || nodeFieldUpdateInput)
        ) {
            const connectName = `${rel.connectionPrefix}${upperFieldName}ConnectFieldInput`;
            const connect = rel.typeMeta.array ? `[${connectName}!]` : connectName;
            const connectWhereName = `${node.name}ConnectWhere`;

            schemaComposer.getOrCreateITC(connectWhereName, (tc) => {
                tc.addFields({ node: `${node.name}Where!` });
            });

            schemaComposer.getOrCreateITC(connectName, (tc) => {
                tc.addFields({ where: connectWhereName });

                if (node.relationFields.length) {
                    tc.addFields({
                        connect: rel.typeMeta.array ? `[${node.name}ConnectInput!]` : `${node.name}ConnectInput`,
                    });
                }

                if (hasNonGeneratedProperties) {
                    tc.addFields({
                        edge: `${rel.properties}CreateInput${hasNonNullNonGeneratedProperties ? `!` : ""}`,
                    });
                }

                tc.addFields({ overwrite });
                tc.makeFieldNonNull("overwrite");
            });

            if (nodeFieldUpdateInput) {
                nodeFieldUpdateInput.addFields({ connect });
            }

            if (nodeFieldInput) {
                nodeFieldInput.addFields({ connect });
            }

            const nodeConnectInput = schemaComposer.getOrCreateITC(`${sourceName}ConnectInput`);
            nodeConnectInput.addFields({
                [rel.fieldName]: {
                    type: connect,
                    directives: deprecatedDirectives,
                },
            });
        }
        if (rel.settableOptions.onUpdate && nodeFieldUpdateInput) {
            const connectionUpdateInputName = `${rel.connectionPrefix}${upperFieldName}UpdateConnectionInput`;

            nodeUpdateInput.addFields({
                [rel.fieldName]: {
                    type: rel.typeMeta.array
                        ? `[${nodeFieldUpdateInput.getTypeName()}!]`
                        : nodeFieldUpdateInput.getTypeName(),
                    directives: deprecatedDirectives,
                },
            });

            schemaComposer.getOrCreateITC(connectionUpdateInputName, (tc) => {
                tc.addFields({ node: `${node.name}UpdateInput` });

                if (hasNonGeneratedProperties) {
                    tc.addFields({ edge: `${rel.properties}UpdateInput` });
                }
            });

            if (nestedOperations.has(RelationshipNestedOperationsOption.UPDATE)) {
                nodeFieldUpdateInput.addFields({ update: connectionUpdateInputName });
            }
        }

        if (nestedOperations.has(RelationshipNestedOperationsOption.DELETE) && nodeFieldUpdateInput) {
            const nodeFieldDeleteInputName = `${rel.connectionPrefix}${upperFieldName}DeleteFieldInput`;

            nodeFieldUpdateInput.addFields({
                delete: rel.typeMeta.array ? `[${nodeFieldDeleteInputName}!]` : nodeFieldDeleteInputName,
            });

            if (!schemaComposer.has(nodeFieldDeleteInputName)) {
                schemaComposer.getOrCreateITC(nodeFieldDeleteInputName, (tc) => {
                    tc.addFields({ where: `${rel.connectionPrefix}${upperFieldName}ConnectionWhere` });

                    if (node.relationFields.length) {
                        tc.addFields({ delete: `${node.name}DeleteInput` });
                    }
                });
            }

            const nodeDeleteInput = schemaComposer.getOrCreateITC(`${sourceName}DeleteInput`);
            nodeDeleteInput.addFields({
                [rel.fieldName]: {
                    type: rel.typeMeta.array ? `[${nodeFieldDeleteInputName}!]` : nodeFieldDeleteInputName,
                    directives: deprecatedDirectives,
                },
            });
        }

        if (nestedOperations.has(RelationshipNestedOperationsOption.DISCONNECT) && nodeFieldUpdateInput) {
            const nodeFieldDisconnectInputName = `${rel.connectionPrefix}${upperFieldName}DisconnectFieldInput`;

            if (!schemaComposer.has(nodeFieldDisconnectInputName)) {
                schemaComposer.getOrCreateITC(nodeFieldDisconnectInputName, (tc) => {
                    tc.addFields({ where: `${rel.connectionPrefix}${upperFieldName}ConnectionWhere` });

                    if (node.relationFields.length) {
                        tc.addFields({ disconnect: `${node.name}DisconnectInput` });
                    }
                });
            }

            nodeFieldUpdateInput.addFields({
                disconnect: rel.typeMeta.array ? `[${nodeFieldDisconnectInputName}!]` : nodeFieldDisconnectInputName,
            });

            const nodeDisconnectInput = schemaComposer.getOrCreateITC(`${sourceName}DisconnectInput`);
            nodeDisconnectInput.addFields({
                [rel.fieldName]: {
                    type: rel.typeMeta.array ? `[${nodeFieldDisconnectInputName}!]` : nodeFieldDisconnectInputName,
                    directives: deprecatedDirectives,
                },
            });
        }
    });
}

export default createRelationshipFields;
