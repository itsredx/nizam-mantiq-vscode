const { Parser, Language, Query } = require('web-tree-sitter');
const fs = require('fs');
const path = require('path');

async function main() {
    try {
        await Parser.init();
        const wasmPath = path.join(__dirname, 'tree-sitter-mantiq.wasm');
        const Mantiq = await Language.load(wasmPath);
        
        const parser = new Parser();
        parser.setLanguage(Mantiq);

        const scmPath = path.join(__dirname, 'syntaxes', 'highlights.scm');
        const scm = fs.readFileSync(scmPath, 'utf8');
        const query = new Query(Mantiq, scm);

        const code = "let p as ptr[i32] = ref num;\nlet val as i32 = deref p;\nawait foo();";
        const tree = parser.parse(code);

        const captures = query.captures(tree.rootNode);
        console.log(`Found ${captures.length} captures.`);
        for (const capture of captures) {
            console.log(`Capture: ${capture.name} ${capture.node.text}`);
        }
    } catch (err) {
        console.error("ERROR:", err);
    }
}
main();
