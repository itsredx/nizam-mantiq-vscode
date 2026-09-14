const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const serverPath = path.join(__dirname, 'out', 'server.js');
const ls = spawn('node', [serverPath, '--stdio']);

let messageId = 1;

function send(method, params) {
    const msg = {
        jsonrpc: "2.0",
        id: messageId++,
        method: method,
        params: params
    };
    const body = JSON.stringify(msg);
    const payload = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
    ls.stdin.write(payload);
    return msg.id;
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

let buffer = '';
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
                console.log("Received:", JSON.stringify(parsed, null, 2));
                if (parsed.id === 2) { // after initialized
                    const mantiqPath = path.resolve(__dirname, '..', 'MANTIQ.mq');
                    const mantiqUri = 'file://' + mantiqPath;
                    // Send didOpen
                    sendNotification('textDocument/didOpen', {
                        textDocument: {
                            uri: mantiqUri,
                            languageId: 'mantiq',
                            version: 1,
                            text: fs.readFileSync(mantiqPath, 'utf8')
                        }
                    });
                    
                    // Trigger prepareRename on `draw` at line 59 (which is row 58)
                    send('textDocument/prepareRename', {
                        textDocument: { uri: mantiqUri },
                        position: { line: 58, character: 8 }
                    });
                }
                
                if (parsed.id === 3) {
                    const mantiqPath = path.resolve(__dirname, '..', 'MANTIQ.mq');
                    const mantiqUri = 'file://' + mantiqPath;
                    // Response to prepareRename
                    console.log("PrepareRename returned", parsed.result);
                    
                    // Simulate inline preview edit: change 'draw' to 'just_draw' on line 59
                    let txt = fs.readFileSync(mantiqPath, 'utf8');
                    let lines = txt.split('\n');
                    lines[58] = lines[58].replace('draw', 'just_draw');
                    sendNotification('textDocument/didChange', {
                        textDocument: { uri: mantiqUri, version: 2 },
                        contentChanges: [{ text: lines.join('\n') }]
                    });
                    
                    // Send rename Request
                    send('textDocument/rename', {
                        textDocument: { uri: mantiqUri },
                        position: { line: 58, character: 8 },
                        newName: "just_draw"
                    });
                }

                if (parsed.id === 4) {
                    console.log("Rename returned", JSON.stringify(parsed.result, null, 2));
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

send('initialize', {
    processId: process.pid,
    rootUri: null,
    capabilities: {},
    initializationOptions: {
        wasmPath: path.join(__dirname, 'tree-sitter-mantiq.wasm')
    }
});
setTimeout(() => sendNotification('initialized', {}), 500);

