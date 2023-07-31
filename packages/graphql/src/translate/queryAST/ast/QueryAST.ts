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

import Cypher from "@neo4j/cypher-builder";
import type { ReadOperation } from "./operations/ReadOperation";
import { ReadOperationVisitor } from "../visitors/ReadOperationVisitor";

export class QueryAST {
    private operation: ReadOperation;

    constructor(operation: ReadOperation) {
        this.operation = operation;
    }

    public transpile(): Cypher.Clause {
        // const visitor = new QueryASTVisitor();

        const visitReadVisitor = new ReadOperationVisitor({
            readOperation: this.operation,
            returnVariable: new Cypher.NamedNode("this"),
        });
        this.operation.children.forEach((s) => s.accept(visitReadVisitor));
        return visitReadVisitor.build();

        // this.operation.accept(visitor);
        // return visitor.build();

        // return this.operation.transpile({ returnVariable: new Cypher.NamedVariable("this") });
    }
}
