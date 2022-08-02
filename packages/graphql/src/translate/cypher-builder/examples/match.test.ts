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

import * as CypherBuilder from "../CypherBuilder";

describe("CypherBuilder Match Examples", () => {
    test("Match movies by actor name and released date", () => {
        const nameParam = new CypherBuilder.Param("Keanu Reeves");
        const releasedParam = new CypherBuilder.Param(1999);

        const movieNode = new CypherBuilder.Node({
            labels: ["Movie"],
        });
        const personNode = new CypherBuilder.Node({
            labels: ["Person"],
        });

        const relationship = new CypherBuilder.Relationship({
            source: personNode,
            target: movieNode,
            type: "ACTED_IN",
        });

        // This where is a simplified sugar syntax for simple x=y AND z=w queries
        const matchQuery = new CypherBuilder.Match(relationship)
            .where(personNode, { name: nameParam })
            .and(movieNode, { released: releasedParam })
            .return(movieNode.property("title"), [movieNode.property("released"), "year"]);

        const queryResult = matchQuery.build();
        expect(queryResult.cypher).toMatchInlineSnapshot(`
            "MATCH (this1:\`Person\`)-[this0:ACTED_IN]->(this2:\`Movie\`)
            WHERE (this1.name = $param0 AND this2.released = $param1)
            RETURN this2.title, this2.released AS year"
        `);

        expect(queryResult.params).toMatchInlineSnapshot(`
            Object {
              "param0": "Keanu Reeves",
              "param1": 1999,
            }
        `);
    });

    test("Match movies from actor and two years with OR operator", () => {
        const nameParam = new CypherBuilder.Param("Keanu Reeves");
        const released1Param = new CypherBuilder.Param(1999);
        const released2Param = new CypherBuilder.Param(2000);

        const movieNode = new CypherBuilder.Node({
            labels: ["Movie"],
        });
        const personNode = new CypherBuilder.Node({
            labels: ["Person"],
        });

        const relationship = new CypherBuilder.Relationship({
            source: personNode,
            target: movieNode,
            type: "ACTED_IN",
        });

        const matchQuery = new CypherBuilder.Match(relationship)
            .where(
                CypherBuilder.and(
                    CypherBuilder.eq(personNode.property("name"), nameParam),
                    CypherBuilder.or(
                        CypherBuilder.eq(movieNode.property("year"), released1Param),
                        CypherBuilder.eq(movieNode.property("year"), released2Param)
                    )
                )
            )
            .return(movieNode.property("title"));

        const queryResult = matchQuery.build();
        expect(queryResult.cypher).toMatchInlineSnapshot(`
            "MATCH (this1:\`Person\`)-[this0:ACTED_IN]->(this2:\`Movie\`)
            WHERE (this1.name = $param0 AND (this2.year = $param1 OR this2.year = $param2))
            RETURN this2.title"
        `);

        expect(queryResult.params).toMatchInlineSnapshot(`
            Object {
              "param0": "Keanu Reeves",
              "param1": 1999,
              "param2": 2000,
            }
        `);
    });

    test("Match and update movie", () => {
        const nameParam = new CypherBuilder.Param("Keanu Reeves");
        const evilKeanu = new CypherBuilder.Param("Seveer unaeK");

        const personNode = new CypherBuilder.Node({
            labels: ["Person"],
        });

        const matchQuery = new CypherBuilder.Match(personNode)
            .where(personNode, { name: nameParam })
            .set([personNode.property("name"), evilKeanu])
            .return(personNode);

        const queryResult = matchQuery.build();
        expect(queryResult.cypher).toMatchInlineSnapshot(`
            "MATCH (this0:\`Person\`)
            WHERE this0.name = $param0
            SET
                this0.name = $param1
            RETURN this0"
        `);

        expect(queryResult.params).toMatchInlineSnapshot(`
            Object {
              "param0": "Keanu Reeves",
              "param1": "Seveer unaeK",
            }
        `);
    });
});
