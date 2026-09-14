const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const serverPath = path.join(__dirname, 'out', 'server.js');
const ls = spawn('node', [serverPath, '--stdio']);

let messageId = 1;

function sendRequest(method, params) {
    const id = messageId++;
    const msg = { jsonrpc: "2.0", id, method, params };
    const body = JSON.stringify(msg);
    ls.stdin.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
    return id;
}

function sendNotification(method, params) {
    const msg = { jsonrpc: "2.0", method, params };
    const body = JSON.stringify(msg);
    ls.stdin.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
}

let buffer = '';
let initId, prepareId, renameId;

// Revert MANTIQ.mq temporarily to `radius` in memory
const mantiqPath = path.resolve(__dirname, '..', 'MANTIQ.mq');
const mantiqUri = 'file://' + mantiqPath;
let code = fs.readFileSync(mantiqPath, 'utf8');
code = code.replace(/my_radius/g, 'radius');

ls.stdout.on('data', (data) => {
    buffer += data.toString();
    while (true) {
        const match = buffer.match(/Content-Length: (\d+)\r\n\r\n/);
        if (!match) break;
        const length = parseInt(match[1]);
        const headerLength = match[0].length;
        if (buffer.length >= headerLength + length) {
            const body = buffer.slice(headerLength, headerLength + length);
            buffer = buffer.slice(headerLength + length);
            try {
                const parsed = JSON.parse(body);
                if (parsed.id === initId) {
                    sendNotification('initialized', {});
                    setTimeout(() => {
                        sendNotification('textDocument/didOpen', {
                            textDocument: {
                                uri: mantiqUri,
                                languageId: 'mantiq',
                                version: 1,
                                text: code
                            }
                        });

                        setTimeout(() => {
                            // Find line of `private var radius`
                            const lines = code.split('\n');
                            const radiusLine = lines.findIndex(l => l.includes('private var radius'));
                            const col = lines[radiusLine].indexOf('radius');
                            console.log(`Testing prepareRename on line ${radiusLine + 1}, col ${col}...`);

                            prepareId = sendRequest('textDocument/prepareRename', {
                                textDocument: { uri: mantiqUri },
                                position: { line: radiusLine, character: col }
                            });
                        }, 200);
                    }, 500);
                } else if (parsed.id === prepareId) {
                    console.log("PrepareRename result:", parsed.result);
                    const lines = code.split('\n');
                    const radiusLine = lines.findIndex(l => l.includes('private var radius'));
                    const col = lines[radiusLine].indexOf('radius');

                    renameId = sendRequest('textDocument/rename', {
                        textDocument: { uri: mantiqUri },
                        position: { line: radiusLine, character: col },
                        newName: "my_radius"
                    });
                } else if (parsed.id === renameId) {
                    console.log("Rename result:", JSON.stringify(parsed.result, null, 2));
                    process.exit(0);
                }
            } catch (e) {
                console.error(e);
            }
        } else {
            break;
        }
    }
});

initId = sendRequest('initialize', {
    processId: process.pid,
    rootUri: null,
    capabilities: {},
    initializationOptions: {
        wasmPath: path.join(__dirname, 'tree-sitter-mantiq.wasm')
    }
});
