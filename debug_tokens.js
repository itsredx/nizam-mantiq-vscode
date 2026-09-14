const path = require('path');
const { Parser, Language, Query } = require('web-tree-sitter');
const fs = require('fs');

async function test() {
    await Parser.init();
    const parser = new Parser();
    const wasmPath = path.join(__dirname, 'tree-sitter-mantiq.wasm');
    const Mantiq = await Language.load(wasmPath);
    parser.setLanguage(Mantiq);

    const code = `fn _mem(life[a] mut _r as i32): pass\nfn _mem2(ref mut _r as i32): pass`;
    const tree = parser.parse(code);
    console.log(tree.rootNode.toString());
    
    const scmPath = path.join(__dirname, 'syntaxes', 'highlights.scm');
    const scm = fs.readFileSync(scmPath, 'utf8');
    const query = new Query(Mantiq, scm);
    const matches = query.captures(tree.rootNode);
    
    for (const capture of matches) {
        console.log(`Capture ${capture.name}: [${capture.node.startPosition.column}, ${capture.node.endPosition.column}] '${capture.node.text}'`);
    }
}
test().catch(console.error);
