const { Parser, Language } = require('web-tree-sitter');
const path = require('path');

async function main() {
    await Parser.init();
    const wasmPath = path.join(__dirname, 'tree-sitter-mantiq.wasm');
    const Mantiq = await Language.load(wasmPath);
    console.log("Node type count:", Mantiq.nodeTypeCount);
    for (let i = 0; i < Mantiq.nodeTypeCount; i++) {
        const type = Mantiq.nodeTypeForId(i);
        console.log(type);
    }
}
main();
