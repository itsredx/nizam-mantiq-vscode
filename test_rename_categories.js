const fs = require('fs');
const path = require('path');
const { Parser, Language } = require('web-tree-sitter');

async function run() {
    await Parser.init();
    const Mantiq = await Language.load(path.join(__dirname, 'tree-sitter-mantiq.wasm'));
    const parser = new Parser();
    parser.setLanguage(Mantiq);

    const mantiqCode = fs.readFileSync('../MANTIQ.mq', 'utf8');
    const tree = parser.parse(mantiqCode);

    function findNodeAtPosition(rootNode, line, character) {
        if (!rootNode) return null;
        let current = rootNode;
        let found = true;
        while (found) {
            found = false;
            let bestChild = null;
            let smallestSpan = Infinity;
            for (let i = 0; i < current.childCount; i++) {
                const child = current.child(i);
                if (!child) continue;
                const startRow = child.startPosition.row;
                const startCol = child.startPosition.column;
                const endRow = child.endPosition.row;
                const endCol = child.endPosition.column;
                const startsBeforeOrAt = startRow < line || (startRow === line && startCol <= character);
                const endsAfterOrAt = endRow > line || (endRow === line && endCol >= character);
                if (startsBeforeOrAt && endsAfterOrAt) {
                    const span = (endRow - startRow) * 10000 + (endCol - startCol);
                    if (span <= smallestSpan) {
                        smallestSpan = span;
                        bestChild = child;
                    }
                }
            }
            if (bestChild) {
                current = bestChild;
                found = true;
            }
        }
        return current;
    }

    function getNodeRole(node) {
        let curr = node;
        let inTypeAnnotation = false;
        let isMemberField = false;
        let isFunCall = false;
        let isFunDeclName = false;
        let isTypeName = false;
        let isFieldDecl = false;
        let isParamName = false;
        let isVarDecl = false;
        let enclosingFunction = null;
        let enclosingClass = null;

        while (curr) {
            if (curr.type === 'type_annotation' || curr.type === 'return_annotation' || curr.type === 'generic_type') {
                inTypeAnnotation = true;
            }
            if (curr.type === 'member_expression') {
                // In member_expression, check if this identifier is the property (e.g. self.color -> color)
                const prop = curr.childForFieldName('property') || curr.children[curr.children.length - 1];
                if (prop === node || (prop && prop.startPosition.column === node.startPosition.column && prop.endPosition.column === node.endPosition.column)) {
                    isMemberField = true;
                }
            }
            if (curr.type === 'call_expression') {
                const fn = curr.childForFieldName('function') || curr.children[0];
                if (fn === node || (fn && fn.startPosition.column === node.startPosition.column && fn.endPosition.column === node.endPosition.column)) {
                    isFunCall = true;
                }
            }
            if (curr.type === 'named_function' || curr.type === 'fun_decl') {
                const id = curr.children.find(c => c.type === 'identifier');
                if (id === node || (id && id.startPosition.column === node.startPosition.column && id.endPosition.column === node.endPosition.column)) {
                    isFunDeclName = true;
                }
                if (!enclosingFunction && curr.type === 'fun_decl') enclosingFunction = curr;
            }
            if (curr.type === 'class_decl' || curr.type === 'struct_decl' || curr.type === 'interface_decl' || curr.type === 'enum_decl' || curr.type === 'union_decl' || curr.type === 'type_decl') {
                const id = curr.children.find(c => c.type === 'identifier');
                if (id === node || (id && id.startPosition.column === node.startPosition.column && id.endPosition.column === node.endPosition.column)) {
                    isTypeName = true;
                }
                if (!enclosingClass) enclosingClass = curr;
            }
            if (curr.type === 'var_decl') {
                // If it is directly the variable name in var_decl
                const id = curr.children.find(c => c.type === 'identifier');
                if ((id === node || (id && id.startPosition.column === node.startPosition.column && id.endPosition.column === node.endPosition.column)) && !inTypeAnnotation) {
                    if (enclosingClass && !enclosingFunction) {
                        isFieldDecl = true;
                    } else {
                        isVarDecl = true;
                    }
                }
            }
            if (curr.type === 'param_decl') {
                const id = curr.children.find(c => c.type === 'identifier');
                if ((id === node || (id && id.startPosition.column === node.startPosition.column && id.endPosition.column === node.endPosition.column)) && !inTypeAnnotation) {
                    isParamName = true;
                }
            }
            if (curr.type === 'match_case') {
                const isKeyword = curr.children.find(c => c.text === 'is');
                if (isKeyword) {
                    const idx = curr.children.indexOf(isKeyword);
                    if (idx >= 0 && curr.children[idx + 1] === node) {
                        inTypeAnnotation = true;
                    }
                }
            }
            curr = curr.parent;
        }

        if (inTypeAnnotation || isTypeName) return { role: 'type', enclosingFunction, enclosingClass };
        if (isFunDeclName || isFunCall) return { role: 'function', enclosingFunction, enclosingClass };
        if (isFieldDecl || isMemberField) return { role: 'field', enclosingFunction, enclosingClass };
        if (isParamName || isVarDecl) return { role: 'local', enclosingFunction, enclosingClass };
        return { role: 'general', enclosingFunction, enclosingClass };
    }

    function computeEdits(line, col, newName) {
        const node = findNodeAtPosition(tree.rootNode, line, col);
        if (!node) return { error: "No node found" };
        const oldName = node.text;
        const target = getNodeRole(node);
        console.log(`\nTarget at line ${line+1}:${col} ("${oldName}") -> Role: ${target.role}`);

        const edits = [];
        function walk(n) {
            if (n.type === 'identifier' && n.text === oldName) {
                const roleInfo = getNodeRole(n);
                let match = false;

                if (target.role === 'type') {
                    // Must be a type reference or constructor call
                    if (roleInfo.role === 'type' || (roleInfo.role === 'function' && !roleInfo.enclosingClass)) {
                        match = true;
                    }
                } else if (target.role === 'field') {
                    // Must be field declaration or member expression
                    if (roleInfo.role === 'field') {
                        match = true;
                    }
                } else if (target.role === 'function') {
                    // Must be function declaration or call
                    if (roleInfo.role === 'function') {
                        match = true;
                    }
                } else if (target.role === 'local') {
                    // Must be in the same function scope and not a type
                    if (roleInfo.enclosingFunction === target.enclosingFunction && roleInfo.role !== 'type') {
                        match = true;
                    }
                } else {
                    if (roleInfo.role === target.role) {
                        match = true;
                    }
                }

                if (match) {
                    edits.push({
                        line: n.startPosition.row + 1,
                        col: n.startPosition.column,
                        role: roleInfo.role,
                        text: n.text
                    });
                }
            }
            for (let i = 0; i < n.childCount; i++) {
                walk(n.child(i));
            }
        }
        walk(tree.rootNode);
        return edits;
    }

    console.log("=== Test 1: Renaming Field `color` on line 53 (col 19) ===");
    console.log(computeEdits(52, 19, "my_color"));

    console.log("\n=== Test 2: Renaming Type `color` on line 53 (col 28) ===");
    console.log(computeEdits(52, 28, "ColorType"));

    console.log("\n=== Test 3: Renaming Method `draw` on line 59 (col 8) ===");
    console.log(computeEdits(58, 8, "render"));
}

run();
