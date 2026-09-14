const fs = require('fs');
const path = require('path');
const { Parser, Language } = require('web-tree-sitter');

async function testAll() {
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

    function classifyIdentifier(node) {
        if (!node) return { kind: 'unknown' };

        let curr = node.parent;
        let inTypeAnnotation = false;
        let isMemberProperty = false;
        let isCallFunction = false;
        let isFunDeclName = false;
        let isTypeDeclName = false;
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
                const children = curr.children;
                if (children[children.length - 1] === node || (children[children.length - 1] && children[children.length - 1].text === node.text)) {
                    isMemberProperty = true;
                }
            }
            if (curr.type === 'call_expression') {
                const fn = curr.childForFieldName('function') || curr.children[0];
                if (fn === node || (fn && fn.startPosition.column === node.startPosition.column && fn.endPosition.column === node.endPosition.column)) {
                    isCallFunction = true;
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
                    isTypeDeclName = true;
                }
                // Check if this identifier is in the base inheritance list (e.g. class Circle(Shape))
                if (curr.type === 'class_decl' && !isTypeDeclName && !inTypeAnnotation) {
                    const colon = curr.children.find(c => c.text === ':');
                    if (colon && node.startPosition.row <= colon.startPosition.row) {
                        inTypeAnnotation = true;
                    }
                }
                if (!enclosingClass) enclosingClass = curr;
            }
            if (curr.type === 'var_decl') {
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
                const isKw = curr.children.find(c => c.text === 'is');
                if (isKw && curr.children.indexOf(isKw) < curr.children.indexOf(node)) {
                    inTypeAnnotation = true;
                }
            }
            curr = curr.parent;
        }

        if (inTypeAnnotation || isTypeDeclName) return { kind: 'type', enclosingFunction, enclosingClass };
        if (isFieldDecl || isMemberProperty) return { kind: 'field', enclosingFunction, enclosingClass };
        if (isFunDeclName || isCallFunction) return { kind: 'function', enclosingFunction, enclosingClass };
        if (isParamName || isVarDecl) return { kind: 'local', enclosingFunction, enclosingClass };
        return { kind: 'general', enclosingFunction, enclosingClass };
    }

    function renameSymbol(line, col, newName) {
        const targetNode = findNodeAtPosition(tree.rootNode, line, col);
        if (!targetNode) return null;
        const oldName = targetNode.text;
        const targetClass = classifyIdentifier(targetNode);

        const edits = [];
        function walk(n) {
            if (n.type === 'identifier' && n.text === oldName) {
                const nClass = classifyIdentifier(n);
                let shouldRename = false;

                if (targetClass.kind === 'type') {
                    // Rename type annotations, type definitions, and constructor calls (which are call_expression of a Type)
                    if (nClass.kind === 'type' || (nClass.kind === 'function' && !nClass.enclosingClass)) {
                        shouldRename = true;
                    }
                } else if (targetClass.kind === 'field') {
                    // Rename field declarations and member property accesses
                    if (nClass.kind === 'field') {
                        shouldRename = true;
                    }
                } else if (targetClass.kind === 'function') {
                    // Rename function definitions and call expressions
                    if (nClass.kind === 'function') {
                        shouldRename = true;
                    }
                } else if (targetClass.kind === 'local') {
                    // Rename local variables & params strictly in the same function scope
                    if (nClass.enclosingFunction === targetClass.enclosingFunction && nClass.kind !== 'type') {
                        shouldRename = true;
                    }
                } else {
                    if (nClass.kind === targetClass.kind) {
                        shouldRename = true;
                    }
                }

                if (shouldRename) {
                    edits.push({
                        line: n.startPosition.row + 1,
                        col: n.startPosition.column,
                        kind: nClass.kind,
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

    console.log("1. Rename field `color` at line 53 col 19:");
    console.log(renameSymbol(52, 19, "my_color"));

    console.log("\n2. Rename type `color` at line 53 col 28:");
    console.log(renameSymbol(52, 28, "Color"));

    console.log("\n3. Rename class `Shape` at line 50 col 7:");
    console.log(renameSymbol(49, 7, "MyShape"));

    console.log("\n4. Rename interface `Resizable` at line 46 col 10:");
    console.log(renameSymbol(45, 10, "IResizable"));

    console.log("\n5. Rename method `draw` at line 59 col 8:");
    console.log(renameSymbol(58, 8, "render"));
}

testAll();
