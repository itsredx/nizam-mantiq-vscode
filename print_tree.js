const { Parser, Language } = require('web-tree-sitter');
const path = require('path');

async function main() {
    await Parser.init();
    const wasmPath = path.join(__dirname, 'tree-sitter-mantiq.wasm');
    const Mantiq = await Language.load(wasmPath);
    const parser = new Parser();
    parser.setLanguage(Mantiq);
    const tree = parser.parse("let p as ptr[i32] = ref num");
    console.log(tree.rootNode.toString());
}
main();
