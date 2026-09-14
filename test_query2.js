const { Parser, Language, Query } = require('web-tree-sitter');
const path = require('path');
const fs = require('fs');

async function main() {
    await Parser.init();
    const wasmPath = path.join(__dirname, 'tree-sitter-mantiq.wasm');
    const Mantiq = await Language.load(wasmPath);
    const parser = new Parser();
    parser.setLanguage(Mantiq);
    
    const content = fs.readFileSync('../MANTIQ.mq', 'utf8');
    const tree = parser.parse(content);
    
    const scm = fs.readFileSync('./syntaxes/highlights.scm', 'utf8');
    const query = new Query(Mantiq, scm);
    
    const captures = query.captures(tree.rootNode);
    const properties = captures.filter(c => c.name === 'property');
    const comments = captures.filter(c => c.name === 'comment');
    
    console.log(`Found ${properties.length} properties.`);
    console.log(`Found ${comments.length} comments.`);
    
    if (properties.length > 0) {
        console.log(`Example property: ${properties[0].node.text}`);
    }
}
main();
