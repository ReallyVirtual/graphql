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

import { Neo4jGraphQLAuthJWTPlugin } from "@neo4j/graphql-plugin-auth";
import { gql } from "apollo-server";
import type { DocumentNode } from "graphql";
import { Neo4jGraphQL } from "../../../../src";
import { createJwtRequest } from "../../../utils/create-jwt-request";
import { formatCypher, translateQuery, formatParams } from "../../utils/tck-test-utils";

describe("Cypher -> Connections -> Projections -> Create", () => {
    const secret = "secret";
    let typeDefs: DocumentNode;
    let neoSchema: Neo4jGraphQL;

    beforeAll(() => {
        typeDefs = gql`
            type Movie {
                title: String!
                actors: [Actor!]! @relationship(type: "ACTED_IN", properties: "ActedIn", direction: IN)
            }

            type Actor {
                name: String!
                movies: [Movie!]! @relationship(type: "ACTED_IN", properties: "ActedIn", direction: OUT)
            }

            interface ActedIn {
                screenTime: Int!
            }
        `;

        neoSchema = new Neo4jGraphQL({
            typeDefs,
            config: { enableRegex: true },
            plugins: {
                auth: new Neo4jGraphQLAuthJWTPlugin({
                    secret,
                }),
            },
        });
    });

    test("Connection can be selected following the creation of a single node", async () => {
        const query = gql`
            mutation {
                createMovies(input: [{ title: "Forrest Gump" }]) {
                    movies {
                        title
                        actorsConnection {
                            edges {
                                screenTime
                                node {
                                    name
                                }
                            }
                        }
                    }
                }
            }
        `;

        const req = createJwtRequest("secret", {});
        const result = await translateQuery(neoSchema, query, {
            req,
        });

        expect(formatCypher(result.cypher)).toMatchInlineSnapshot(`
            "CALL {
            CREATE (this0:Movie)
            SET this0.title = $this0_title
            RETURN this0
            }
            CALL {
                WITH this0
                MATCH (this0)<-[this0_connection_actorsConnectionthis0:ACTED_IN]-(this0_Actor:\`Actor\`)
                WITH { screenTime: this0_connection_actorsConnectionthis0.screenTime, node: { name: this0_Actor.name } } AS edge
                WITH collect(edge) AS edges
                WITH edges, size(edges) AS totalCount
                RETURN { edges: edges, totalCount: totalCount } AS this0_actorsConnection
            }
            RETURN [
            this0 { .title, actorsConnection: this0_actorsConnection }] AS data"
        `);

        expect(formatParams(result.params)).toMatchInlineSnapshot(`
            "{
                \\"this0_title\\": \\"Forrest Gump\\",
                \\"resolvedCallbacks\\": {}
            }"
        `);
    });

    test("Connection can be selected following the creation of a multiple nodes", async () => {
        const query = gql`
            mutation {
                createMovies(input: [{ title: "Forrest Gump" }, { title: "Toy Story" }]) {
                    movies {
                        title
                        actorsConnection {
                            edges {
                                screenTime
                                node {
                                    name
                                }
                            }
                        }
                    }
                }
            }
        `;

        const req = createJwtRequest("secret", {});
        const result = await translateQuery(neoSchema, query, {
            req,
        });

        expect(formatCypher(result.cypher)).toMatchInlineSnapshot(`
            "CALL {
            CREATE (this0:Movie)
            SET this0.title = $this0_title
            RETURN this0
            }
            CALL {
            CREATE (this1:Movie)
            SET this1.title = $this1_title
            RETURN this1
            }
            CALL {
                WITH this0
                MATCH (this0)<-[this0_connection_actorsConnectionthis0:ACTED_IN]-(this0_Actor:\`Actor\`)
                WITH { screenTime: this0_connection_actorsConnectionthis0.screenTime, node: { name: this0_Actor.name } } AS edge
                WITH collect(edge) AS edges
                WITH edges, size(edges) AS totalCount
                RETURN { edges: edges, totalCount: totalCount } AS this0_actorsConnection
            }
            CALL {
                WITH this1
                MATCH (this1)<-[this1_connection_actorsConnectionthis0:ACTED_IN]-(this1_Actor:\`Actor\`)
                WITH { screenTime: this1_connection_actorsConnectionthis0.screenTime, node: { name: this1_Actor.name } } AS edge
                WITH collect(edge) AS edges
                WITH edges, size(edges) AS totalCount
                RETURN { edges: edges, totalCount: totalCount } AS this1_actorsConnection
            }
            RETURN [
            this0 { .title, actorsConnection: this0_actorsConnection },
            this1 { .title, actorsConnection: this1_actorsConnection }] AS data"
        `);

        expect(formatParams(result.params)).toMatchInlineSnapshot(`
            "{
                \\"this0_title\\": \\"Forrest Gump\\",
                \\"this1_title\\": \\"Toy Story\\",
                \\"resolvedCallbacks\\": {}
            }"
        `);
    });

    test("Connection can be selected and filtered following the creation of a multiple nodes", async () => {
        const query = gql`
            mutation {
                createMovies(input: [{ title: "Forrest Gump" }, { title: "Toy Story" }]) {
                    movies {
                        title
                        actorsConnection(where: { node: { name: "Tom Hanks" } }) {
                            edges {
                                screenTime
                                node {
                                    name
                                }
                            }
                        }
                    }
                }
            }
        `;

        const req = createJwtRequest("secret", {});
        const result = await translateQuery(neoSchema, query, {
            req,
        });

        expect(formatCypher(result.cypher)).toMatchInlineSnapshot(`
            "CALL {
            CREATE (this0:Movie)
            SET this0.title = $this0_title
            RETURN this0
            }
            CALL {
            CREATE (this1:Movie)
            SET this1.title = $this1_title
            RETURN this1
            }
            CALL {
                WITH this0
                MATCH (this0)<-[this0_connection_actorsConnectionthis0:ACTED_IN]-(this0_Actor:\`Actor\`)
                WHERE this0_Actor.name = $projection_connection_actorsConnectionparam0
                WITH { screenTime: this0_connection_actorsConnectionthis0.screenTime, node: { name: this0_Actor.name } } AS edge
                WITH collect(edge) AS edges
                WITH edges, size(edges) AS totalCount
                RETURN { edges: edges, totalCount: totalCount } AS this0_actorsConnection
            }
            CALL {
                WITH this1
                MATCH (this1)<-[this1_connection_actorsConnectionthis0:ACTED_IN]-(this1_Actor:\`Actor\`)
                WHERE this1_Actor.name = $projection_connection_actorsConnectionparam0
                WITH { screenTime: this1_connection_actorsConnectionthis0.screenTime, node: { name: this1_Actor.name } } AS edge
                WITH collect(edge) AS edges
                WITH edges, size(edges) AS totalCount
                RETURN { edges: edges, totalCount: totalCount } AS this1_actorsConnection
            }
            RETURN [
            this0 { .title, actorsConnection: this0_actorsConnection },
            this1 { .title, actorsConnection: this1_actorsConnection }] AS data"
        `);

        expect(formatParams(result.params)).toMatchInlineSnapshot(`
            "{
                \\"this0_title\\": \\"Forrest Gump\\",
                \\"this1_title\\": \\"Toy Story\\",
                \\"projection_connection_actorsConnectionparam0\\": \\"Tom Hanks\\",
                \\"resolvedCallbacks\\": {}
            }"
        `);
    });
});
