const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const serverPath = path.join(__dirname, 'out', 'server.js');
const ls = spawn('node', [serverPath, '--stdio']);

let messageId = 1;

function sendRequest(method, params) {
    const id = messageId++;
    const msg = {
        jsonrpc: "2.0",
        id: id,
        method: method,
        params: params
    };
    const body = JSON.stringify(msg);
    const payload = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
    ls.stdin.write(payload);
    return id;
}

function sendNotification(method, params) {
    const msg = {
        jsonrpc: "2.0",
        method: method,
        params: params
    };
    const body = JSON.stringify(msg);
    const payload = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
    ls.stdin.write(payload);
}

const mantiqPath = path.resolve(__dirname, '..', 'MANTIQ.mq');
const mantiqUri = 'file://' + mantiqPath;

let buffer = '';
let initId, prepareId, renameId;

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
                    console.log("Initialized response received.");
                    sendNotification('initialized', {});
                    
                    setTimeout(() => {
                        const mantiqCode = fs.readFileSync(mantiqPath, 'utf8');
                        sendNotification('textDocument/didOpen', {
                            textDocument: {
                                uri: mantiqUri,
                                languageId: 'mantiq',
                                version: 1,
                                text: mantiqCode
                            }
                        });

                        setTimeout(() => {
                            // Position of `color` on line 53 (0-indexed: line 52, col 18)
                            prepareId = sendRequest('textDocument/prepareRename', {
                                textDocument: { uri: mantiqUri },
                                position: { line: 52, character: 18 }
                            });
                        }, 200);
                    }, 500);
                } else if (parsed.id === prepareId) {
                    console.log("PrepareRename result:", JSON.stringify(parsed.result, null, 2));

                    // User renames color to my_color
                    renameId = sendRequest('textDocument/rename', {
                        textDocument: { uri: mantiqUri },
                        position: { line: 52, character: 18 },
                        newName: "my_color"
                    });
                } else if (parsed.id === renameId) {
                    console.log("Rename result:", JSON.stringify(parsed.result, null, 2));
                    process.exit(0);
                }
            } catch(e) {
                console.error(e);
            }
        } else {
            break;
        }
    }
});

ls.stderr.on('data', (data) => {
    console.error(`LS STDERR: ${data}`);
});

initId = sendRequest('initialize', {
    processId: process.pid,
    rootUri: null,
    capabilities: {},
    initializationOptions: {
        wasmPath: path.join(__dirname, 'tree-sitter-mantiq.wasm')
    }
});
