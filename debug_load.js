const path = require('path');
const { Parser, Language, Query } = require('web-tree-sitter');
const fs = require('fs');

async function test() {
    try {
        await Parser.init();
        console.log("Parser initialized!");
        
        const wasmPath = path.join(__dirname, 'tree-sitter-mantiq.wasm');
        const Mantiq = await Language.load(wasmPath);
        console.log("WASM loaded successfully!");
        
        const scmPath = path.join(__dirname, 'syntaxes', 'highlights.scm');
        const scm = fs.readFileSync(scmPath, 'utf8');
        const query = new Query(Mantiq, scm);
        console.log("Query loaded successfully!");
    } catch (e) {
        console.error("ERROR:", e);
    }
}
test();
