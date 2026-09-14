const { Parser, Language, Query } = require('web-tree-sitter');
const fs = require('fs');
const path = require('path');

async function main() {
    await Parser.init();
    const wasmPath = path.join(__dirname, 'tree-sitter-mantiq.wasm');
    const Mantiq = await Language.load(wasmPath);
    let scm = fs.readFileSync(path.join(__dirname, 'syntaxes', 'highlights.scm'), 'utf8');
    
    while (true) {
        try {
            new Query(Mantiq, scm);
            console.log("Query is VALID!");
            fs.writeFileSync(path.join(__dirname, 'syntaxes', 'highlights.scm'), scm);
            break;
        } catch (err) {
            if (err.message && err.message.includes('Bad node name')) {
                const badNodeMatch = err.message.match(/Bad node name '([^']+)'/);
                if (badNodeMatch) {
                    const badNode = badNodeMatch[1];
                    console.log("Removing bad node:", badNode);
                    // Remove the bad node from the scm
                    const regex = new RegExp(`"${badNode}"\\s*`, 'g');
                    scm = scm.replace(regex, '');
                } else {
                    console.error("Unknown error:", err);
                    break;
                }
            } else {
                console.error("Unknown error:", err);
                break;
            }
        }
    }
}
main();
