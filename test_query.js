const { Parser, Language, Query } = require('web-tree-sitter');
const path = require('path');

async function main() {
    await Parser.init();
    const wasmPath = path.join(__dirname, 'tree-sitter-mantiq.wasm');
    const Mantiq = await Language.load(wasmPath);
    const parser = new Parser();
    parser.setLanguage(Mantiq);
    const tree = parser.parse("obj.prop = 5\nobj?.prop2()");
    console.log(tree.rootNode.toString());
    
    const scm = `
    (member_expression
      (identifier) @property)
    `;
    const query = new Query(Mantiq, scm);
    const captures = query.captures(tree.rootNode);
    for (const c of captures) {
        console.log(`Captured ${c.name}: ${c.node.text}`);
    }
}
main();
