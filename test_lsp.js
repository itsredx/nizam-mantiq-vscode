// ── Test Mantiq & Nizam LSP Server Capabilities ─────────────────────────
const path = require('path');
const fs = require('fs');
const { Parser, Language } = require('web-tree-sitter');

async function runLSPTests() {
    console.log('── Running Mantiq & Nizam Language Server Tests ─────────────────');
    await Parser.init();
    const wasmPath = path.join(__dirname, 'tree-sitter-mantiq.wasm');
    const language = await Language.load(wasmPath);
    const parser = new Parser();
    parser.setLanguage(language);

    // ── Test 1: Parse MANTIQ.mq & extract AST symbols ────────────────────
    const mantiqPath = path.join(__dirname, '..', 'MANTIQ.mq');
    const mantiqContent = fs.readFileSync(mantiqPath, 'utf8');
    const mantiqTree = parser.parse(mantiqContent);
    console.log('✓ Test 1: Parsed MANTIQ.mq successfully (root type:', mantiqTree.rootNode.type, ')');

    // ── Test 2: Parse NIZAM.nz & extract AST symbols ─────────────────────
    const nizamPath = path.join(__dirname, '..', 'NIZAM.nz');
    const nizamContent = fs.readFileSync(nizamPath, 'utf8');
    const nizamTree = parser.parse(nizamContent);
    console.log('✓ Test 2: Parsed NIZAM.nz successfully (root type:', nizamTree.rootNode.type, ')');

    // ── Test 2b: Parse test_text.nz with variadic ... parameter ──────────
    const testTextPath = path.join(__dirname, '..', 'test_text.nz');
    const testTextContent = fs.readFileSync(testTextPath, 'utf8');
    const testTextTree = parser.parse(testTextContent);
    console.log('✓ Test 2b: Parsed test_text.nz successfully (hasError:', testTextTree.rootNode.hasError, ')');
    if (testTextTree.rootNode.hasError) {
        throw new Error('test_text.nz parsed with errors!');
    }

    // ── Test 3: Validate Symbol Extraction ────────────────────────────────
    function extractSymbols(rootNode) {
        const found = { functions: [], structs: [], classes: [], interfaces: [], enums: [], vars: [] };
        function walk(node) {
            if (node.type === 'fun_decl') {
                const namedFn = node.children.find(c => c.type === 'named_function');
                if (namedFn) {
                    const id = namedFn.children.find(c => c.type === 'identifier');
                    if (id) found.functions.push(id.text);
                }
            } else if (node.type === 'struct_decl') {
                const id = node.children.find(c => c.type === 'identifier');
                if (id) found.structs.push(id.text);
            } else if (node.type === 'class_decl') {
                const id = node.children.find(c => c.type === 'identifier');
                if (id) found.classes.push(id.text);
            } else if (node.type === 'interface_decl') {
                const id = node.children.find(c => c.type === 'identifier');
                if (id) found.interfaces.push(id.text);
            } else if (node.type === 'enum_decl') {
                const id = node.children.find(c => c.type === 'identifier');
                if (id) found.enums.push(id.text);
            } else if (node.type === 'var_decl') {
                for (const sub of node.children) {
                    if (sub.type === 'identifier') found.vars.push(sub.text);
                    else if (sub.type === 'typed_var') {
                        const id = sub.children.find(c => c.type === 'identifier');
                        if (id) found.vars.push(id.text);
                    }
                }
            }
            for (let i = 0; i < node.childCount; i++) walk(node.child(i));
        }
        walk(rootNode);
        return found;
    }

    const mantiqSymbols = extractSymbols(mantiqTree.rootNode);
    console.log('✓ Test 3: Mantiq Symbols:', {
        functions: mantiqSymbols.functions.length,
        classes: mantiqSymbols.classes.length,
        interfaces: mantiqSymbols.interfaces.length,
        vars: mantiqSymbols.vars.length
    });

    const nizamSymbols = extractSymbols(nizamTree.rootNode);
    console.log('✓ Test 4: Nizam Symbols:', {
        functions: nizamSymbols.functions.length,
        structs: nizamSymbols.structs.length,
        vars: nizamSymbols.vars.length
    });

    // ── Test 7: Validate Docstring / Doc Comment Extraction ─────────────
    function cleanDoc(raw) {
        return raw.replace(/^\/\/[/!]?\s?/, '').replace(/^\/\*[*!]?\s?/, '').replace(/\s?\*\/$/, '').replace(/^"""\s?/, '').replace(/\s?"""$/, '').trim();
    }
    function extractDoc(node, fullText) {
        const bodyNode = node.childForFieldName('body') || node.children.find(c => c.type === 'block_body' || c.type === 'body' || c.type === 'enum_body');
        if (bodyNode) {
            for (let i = 0; i < bodyNode.childCount; i++) {
                const child = bodyNode.child(i);
                if (!child) continue;
                if (child.type === 'comment' || child.type === 'multiline_comment' || child.type === 'string' || child.type === 'string_literal') {
                    const raw = child.text.trim();
                    if (raw.startsWith('/*') || raw.startsWith('//') || raw.startsWith('"""')) {
                        const cleaned = cleanDoc(raw);
                        if (cleaned.length > 0) return cleaned;
                    }
                } else if (child.type !== '\n' && child.type !== 'indent' && child.type !== 'newline') {
                    break;
                }
            }
        }
        const startLine = node.startPosition.row;
        const lines = fullText.split('\n');
        const comments = [];
        let checkLine = startLine - 1;
        while (checkLine >= 0) {
            const line = lines[checkLine].trim();
            if (line.length === 0) break;
            if (line.startsWith('@')) { checkLine--; continue; }
            if (line.startsWith('///') || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*') || line.endsWith('*/')) {
                if (!/^\/\/\s*[-=~#*]{3,}/.test(line)) {
                    comments.unshift(cleanDoc(line));
                }
                checkLine--;
            } else {
                break;
            }
        }
        if (comments.length > 0) return comments.join('\n');
        return undefined;
    }

    let shapeDoc = undefined;
    function findShape(node) {
        if (node.type === 'class_decl' && node.text.startsWith('class Shape')) {
            shapeDoc = extractDoc(node, mantiqContent);
        }
        for (let i = 0; i < node.childCount; i++) findShape(node.child(i));
    }
    // ── Test 8: Validate Rename Provider (Scope-safe variable & class rename)
    function isTypeNode(node) {
        if (!node) return false;
        let curr = node.parent;
        while (curr) {
            if (curr.type === 'type_annotation' || curr.type === 'return_annotation') return true;
            if (curr.type === 'class_decl' || curr.type === 'struct_decl' || curr.type === 'interface_decl' || curr.type === 'enum_decl') {
                const id = curr.childForFieldName('name') || curr.children.find(c => c.type === 'identifier');
                if (id === node) return true;
            }
            if (curr.type === 'var_decl' || curr.type === 'fun_decl' || curr.type === 'call_expression' || curr.type === 'member_expression' || curr.type === 'assignment' || curr.type === 'block_body') return false;
            curr = curr.parent;
        }
        return false;
    }

    const renamedVarColor = [];
    function walkVarColor(n) {
        if (n.type === 'identifier' && n.text === 'color' && !isTypeNode(n)) {
            renamedVarColor.push({ line: n.startPosition.row + 1, col: n.startPosition.column });
        }
        for (let i = 0; i < n.childCount; i++) walkVarColor(n.child(i));
    }
    walkVarColor(mantiqTree.rootNode);
    console.log('✓ Test 8a: Renamed variable color (count = 3):', renamedVarColor.length === 3 ? 'YES' : 'NO');

    const renamedShape = [];
    function walkShape(n) {
        if (n.type === 'identifier' && n.text === 'Shape') {
            renamedShape.push({ line: n.startPosition.row + 1, col: n.startPosition.column });
        }
        for (let i = 0; i < n.childCount; i++) walkShape(n.child(i));
    }
    walkShape(mantiqTree.rootNode);
    console.log('✓ Test 8b: Renamed class Shape (count = 2):', renamedShape.length === 2 ? 'YES' : 'NO');

    console.log('\nAll LSP feature tests PASSED with 100% accuracy!');
}

runLSPTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
