// ── Mantiq & Nizam Language Server ──────────────────────────────────────
import {
    createConnection,
    TextDocuments,
    Diagnostic,
    DiagnosticSeverity,
    ProposedFeatures,
    InitializeParams,
    DidChangeConfigurationNotification,
    CompletionItem,
    CompletionItemKind,
    InsertTextFormat,
    TextDocumentPositionParams,
    TextDocumentSyncKind,
    InitializeResult,
    Hover,
    MarkupKind,
    Definition,
    Location,
    Range,
    Position,
    DocumentSymbolParams,
    DocumentSymbol,
    SymbolKind,
    WorkspaceSymbolParams,
    SignatureHelp,
    SignatureInformation,
    ParameterInformation,
    ReferenceParams,
    RenameParams,
    WorkspaceEdit,
    TextEdit,
    FoldingRange,
    FoldingRangeParams,
    FoldingRangeKind
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import * as path from 'path';
import * as fs from 'fs';
import { URL } from 'url';

const uriToPath = (uri: string): string => {
    try {
        if (uri.startsWith('file://')) {
            return decodeURIComponent(new URL(uri).pathname);
        }
        return uri;
    } catch {
        return uri.replace(/^file:\/\//, '');
    }
};

const pathToUri = (filePath: string): string => {
    return 'file://' + path.resolve(filePath);
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Parser, Language } = require('web-tree-sitter');

// ── Types & Interfaces ──────────────────────────────────────────────────
interface SymbolParam {
    name: string;
    type?: string;
    doc?: string;
    defaultValue?: string;
}

interface ASTSymbol {
    name: string;
    kind: SymbolKind;
    detail: string;
    documentation?: string;
    range: Range;
    selectionRange: Range;
    scopeRange: Range;
    uri: string;
    containerName?: string;
    params?: SymbolParam[];
    returnType?: string;
    children?: ASTSymbol[];
    access?: 'public' | 'private' | 'protected' | 'internal';
    isStatic?: boolean;
}

interface ImportInfo {
    modulePath: string;
    importedSymbols: string[];
    alias?: string;
    range: Range;
    uri: string;
}

interface DocumentIndex {
    uri: string;
    symbols: ASTSymbol[];
    flatSymbols: ASTSymbol[];
    imports: ImportInfo[];
    tree: any;
    text: string;
}

// ── Connection & Document Management ────────────────────────────────────
const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let parser: any;
let language: any;
let wasmPath = '';
let workspaceFolders: string[] = [];

// In-memory workspace symbol table & document cache
const documentIndices = new Map<string, DocumentIndex>();

// ── Built-in Knowledge Base ─────────────────────────────────────────────
const BUILTIN_TYPES: Record<string, { desc: string; detail: string }> = {
    'i8': { desc: '8-bit signed integer (-128 to 127)', detail: 'primitive type i8' },
    'i16': { desc: '16-bit signed integer (-32,768 to 32,767)', detail: 'primitive type i16' },
    'i32': { desc: '32-bit signed integer (standard int)', detail: 'primitive type i32' },
    'i64': { desc: '64-bit signed integer', detail: 'primitive type i64' },
    'i128': { desc: '128-bit signed integer for large numeric ranges', detail: 'primitive type i128' },
    'i256': { desc: '256-bit signed integer for cryptography & big integers', detail: 'primitive type i256' },
    'i512': { desc: '512-bit signed integer for ultra high-precision arithmetic', detail: 'primitive type i512' },
    'i1024': { desc: '1024-bit signed integer for extreme numeric calculations', detail: 'primitive type i1024' },
    'isize': { desc: 'Pointer-sized signed integer', detail: 'primitive type isize' },
    'u8': { desc: '8-bit unsigned integer / byte (0 to 255)', detail: 'primitive type u8' },
    'u16': { desc: '16-bit unsigned integer (0 to 65,535)', detail: 'primitive type u16' },
    'u32': { desc: '32-bit unsigned integer', detail: 'primitive type u32' },
    'u64': { desc: '64-bit unsigned integer', detail: 'primitive type u64' },
    'u128': { desc: '128-bit unsigned integer', detail: 'primitive type u128' },
    'u256': { desc: '256-bit unsigned integer for cryptography & big integers', detail: 'primitive type u256' },
    'u512': { desc: '512-bit unsigned integer', detail: 'primitive type u512' },
    'u1024': { desc: '1024-bit unsigned integer', detail: 'primitive type u1024' },
    'usize': { desc: 'Pointer-sized unsigned integer (array indices & lengths)', detail: 'primitive type usize' },
    'f16': { desc: '16-bit half-precision floating point', detail: 'primitive type f16' },
    'bf16': { desc: 'Bfloat16 brain floating point (AI / ML tensor optimized)', detail: 'primitive type bf16' },
    'f32': { desc: '32-bit single-precision floating point', detail: 'primitive type f32' },
    'f64': { desc: '64-bit double-precision floating point', detail: 'primitive type f64' },
    'f128': { desc: '128-bit quad-precision floating point for intense calculations', detail: 'primitive type f128' },
    'f256': { desc: '256-bit octuple-precision floating point', detail: 'primitive type f256' },
    'f512': { desc: '512-bit floating point', detail: 'primitive type f512' },
    'bool': { desc: 'Boolean value (True or False)', detail: 'primitive type bool' },
    'char': { desc: '4-byte Unicode character', detail: 'primitive type char' },
    'byte': { desc: 'Alias for u8 byte representing raw memory', detail: 'primitive type byte' },
    'str': { desc: 'UTF-8 string slice view', detail: 'primitive type str' },
    'cstr': { desc: 'C-compatible null-terminated string pointer', detail: 'primitive type cstr' },
    'webstr': { desc: 'UTF-16 string for browser, JVM, and CLR interop', detail: 'primitive type webstr' },
    'asciistr': { desc: 'Fast, memory-efficient ASCII string', detail: 'primitive type asciistr' },
    'rangestr': { desc: 'UTF-32 string for full Unicode range operations', detail: 'primitive type rangestr' },
    'utf8str': { desc: 'UTF-8 encoded string (default string type)', detail: 'primitive type utf8str' },
    'String': { desc: 'Growable, heap-allocated string buffer', detail: 'struct String' },
    'List': { desc: 'Growable or fixed-size collection `List[T]` or `List[T, N]`', detail: 'struct List[T]' },
    'Dict': { desc: 'Key-value hash map dictionary `Dict[K, V]`', detail: 'struct Dict[K, V]' },
    'Set': { desc: 'Unique element hash set `Set[T]`', detail: 'struct Set[T]' },
    'slice': { desc: 'Dynamically-sized contiguous view into a sequence `slice[T]`', detail: 'type slice[T]' },
    'tuple': { desc: 'Multi-type ordered value tuple', detail: 'type tuple' },
    'Result': { desc: 'Zero-cost typed error handling: `Result[T, E]` (Ok(T) or Err(E))', detail: 'enum Result[T, E]' },
    'Option': { desc: 'Optional nullable value: `Option[T]` (Some(T) or Empty)', detail: 'enum Option[T]' },
    'Any': { desc: 'Dynamic typing, UI reflection, and polymorphic value', detail: 'type Any' },
    'qbit': { desc: 'Fundamental quantum bit (DCE pruned if unused)', detail: 'primitive type qbit' },
    'qreg': { desc: 'Quantum register of N qubits: `qreg[N]`', detail: 'primitive type qreg[N]' },
    'void': { desc: 'Unit / void return type', detail: 'primitive type void' },
    'ptr': { desc: 'Raw memory pointer `ptr[T]`', detail: 'type ptr[T]' },
    'PyObject': { desc: 'Raw Python C-API PyObject reference wrapper', detail: 'type PyObject' }
};

const BUILTIN_FUNCTIONS: Record<string, { sig: string; doc: string; params: string[] }> = {
    'print': { sig: 'print(values: ...Any) as void', doc: 'Prints values to standard output.', params: ['values: ...Any'] },
    'println': { sig: 'println(values: ...Any) as void', doc: 'Prints values with trailing newline to standard output.', params: ['values: ...Any'] },
    'printf': { sig: 'printf(format: cstr, args: ...Any) as i32', doc: 'Formatted output conversion using C runtime printf.', params: ['format: cstr', 'args: ...Any'] },
    'make': { sig: 'make[T](args: ...Any) as ptr[T]', doc: 'Allocates heap memory and instantiates type T.', params: ['args: ...Any'] },
    'drop': { sig: 'drop(val: Any) as void', doc: 'Explicitly destructs and deallocates memory for val.', params: ['val: Any'] },
    'len': { sig: 'len(collection: Any) as usize', doc: 'Returns the number of elements in a list, string, or collection.', params: ['collection: Any'] },
    'resize': { sig: 'resize(p: ptr[u8], new_capacity: usize) as ptr[u8]', doc: 'Resizes a heap-allocated buffer to new capacity.', params: ['p: ptr[u8]', 'new_capacity: usize'] },
    'memcpy': { sig: 'memcpy(dest: ptr, src: ptr, count: usize) as ptr', doc: 'Copies count bytes from source memory to destination memory.', params: ['dest: ptr', 'src: ptr', 'count: usize'] },
    'range': { sig: 'range(start: i64, end: i64, step: i64 = 1) as List[i64]', doc: 'Generates a range sequence from start to end.', params: ['start: i64', 'end: i64', 'step: i64 = 1'] },
    'Ok': { sig: 'Ok[T](val: T) as Result[T, Any]', doc: 'Constructs a successful Result value.', params: ['val: T'] },
    'Err': { sig: 'Err[E](err: E) as Result[Any, E]', doc: 'Constructs an error Result value.', params: ['err: E'] },
    'Some': { sig: 'Some[T](val: T) as Option[T]', doc: 'Constructs a present Option value.', params: ['val: T'] },
    'H': { sig: 'H(qubit: qbit) as void', doc: 'Applies Hadamard quantum gate to a qubit.', params: ['qubit: qbit'] },
    'CNOT': { sig: 'CNOT(control: qbit, target: qbit) as void', doc: 'Applies Controlled-NOT quantum gate to target qubit.', params: ['control: qbit', 'target: qbit'] }
};

const KEYWORDS_DOCS: Record<string, { desc: string; detail: string }> = {
    'fn': { desc: 'Declares a function or method with parameters and return type.', detail: 'fn name(params) -> ReturnType:' },
    'struct': { desc: 'Declares a stack-allocated value structure type.', detail: 'struct Name:\n    fields...' },
    'class': { desc: 'Declares a reference-type heap-allocated class with OOP inheritance.', detail: 'class Name(Bases):\n    fields/methods...' },
    'interface': { desc: 'Declares a trait/interface contract defining abstract methods.', detail: 'interface Name:\n    abstract fn method()' },
    'enum': { desc: 'Declares an enumeration with tagged variants.', detail: 'enum Name:\n    Variant1, Variant2' },
    'union': { desc: 'Declares a memory union or tagged union type.', detail: 'union Name:\n    fields...' },
    'type': { desc: 'Defines a custom type alias.', detail: 'type NewType = TargetType' },
    'macro': { desc: 'Declares a compile-time AST macro.', detail: 'macro name(args):' },
    'let': { desc: 'Declares an immutable variable binding (or mutable with mut).', detail: 'let [mut] name as Type = value' },
    'var': { desc: 'Declares a mutable variable binding shorthand.', detail: 'var name as Type = value' },
    'const': { desc: 'Declares a compile-time constant evaluated during compilation.', detail: 'const NAME as Type = value' },
    'mut': { desc: 'Specifies that a variable or reference is mutable.', detail: 'mut' },
    'ref': { desc: 'Borrows or passes a value by reference.', detail: 'ref [mut] value' },
    'deref': { desc: 'Explicitly dereferences a pointer to access the underlying memory.', detail: 'deref ptr_expr' },
    'as': { desc: 'Specifies type annotations or casting.', detail: 'name as Type' },
    'to': { desc: 'Explicitly casts an expression to a target type.', detail: 'expr to TargetType' },
    'if': { desc: 'Conditional execution branch or inline conditional expression.', detail: 'if condition:\n    ...' },
    'elif': { desc: 'Else-if alternative branch.', detail: 'elif condition:\n    ...' },
    'else': { desc: 'Fallback alternative branch.', detail: 'else:\n    ...' },
    'while': { desc: 'Loops while condition evaluates to true.', detail: 'while condition:\n    ...' },
    'for': { desc: 'Iterates over elements in a sequence or collection.', detail: 'for item in iterable:\n    ...' },
    'in': { desc: 'Tests membership or binds loop variable in a sequence.', detail: 'item in sequence' },
    'match': { desc: 'Pattern matching on expressions and types.', detail: 'match value:\n    case pattern:\n        ...' },
    'case': { desc: 'Branch case within a match pattern block.', detail: 'case pattern [if guard]:' },
    'break': { desc: 'Breaks out of the innermost loop.', detail: 'break' },
    'continue': { desc: 'Skips to the next iteration of the loop.', detail: 'continue' },
    'return': { desc: 'Returns a value from the current function.', detail: 'return value' },
    'raise': { desc: 'Raises an error payload in zero-cost error handling.', detail: 'raise error_payload' },
    'try': { desc: 'Guards fallible calls with zero-cost error handling or try-except blocks.', detail: 'try:\n    ...\nexcept Error as e:\n    ...' },
    'except': { desc: 'Catches errors raised in a try block.', detail: 'except ExceptionType as err:' },
    'finally': { desc: 'Guarantees execution of cleanup code block.', detail: 'finally:' },
    'with': { desc: 'Scoped resource management block with automatic disposal.', detail: 'with resource as r:\n    ...' },
    'spawn': { desc: 'Spawns an asynchronous actor or lightweight concurrent task.', detail: 'spawn async fn(): ...' },
    'async': { desc: 'Marks a function or expression as asynchronous.', detail: 'async fn name(): ...' },
    'await': { desc: 'Awaits completion of an asynchronous task or future.', detail: 'await async_call()' },
    'pass': { desc: 'No-op statement placeholder.', detail: 'pass' },
    'yield': { desc: 'Yields execution control or generator value.', detail: 'yield value' },
    'import': { desc: 'Imports symbols or modules from libraries and paths.', detail: 'import module | from module import sym' },
    'from': { desc: 'Specifies source module in import statements.', detail: 'from module import symbol' },
    'link': { desc: 'Declares a native library linkage requirement.', detail: 'link "library"' },
    'public': { desc: 'Public visibility access modifier.', detail: 'public' },
    'private': { desc: 'Private visibility access modifier.', detail: 'private' },
    'protected': { desc: 'Protected visibility access modifier (subclasses only).', detail: 'protected' },
    'internal': { desc: 'Module-internal visibility access modifier.', detail: 'internal' },
    'abstract': { desc: 'Declares an abstract method requiring subclass implementation.', detail: 'abstract fn name()' },
    'static': { desc: 'Declares static class members or static memory variables.', detail: 'static' },
    'extern': { desc: 'Declares external C ABI binding function.', detail: 'extern fn name()' },
    'inline': { desc: 'Hints compiler to inline function at call sites.', detail: 'inline fn name()' },
    'final': { desc: 'Prevents overriding of methods or subclassing.', detail: 'final fn name()' },
    'override': { desc: 'Overrides a base class or interface method.', detail: '@override fn name()' },
    'volatile': { desc: 'Marks memory variable as hardware volatile.', detail: 'volatile var name' },
    'atomic': { desc: 'Marks variable as thread-safe atomic memory.', detail: 'atomic var name' },
    'life': { desc: 'Specifies lifetime parameter bound for safe references.', detail: 'life[a]' },
    'unsafe': { desc: 'Marks block or function containing unsafe operations.', detail: 'unsafe:\n    ...' },
    'self': { desc: 'Reference to current struct or class instance.', detail: 'self' },
    'super': { desc: 'Invokes base class constructor or method.', detail: 'super().__init__()' },
    'block': { desc: 'Scoped block statement with named multiple return bindings.', detail: 'block (inputs) as (outputs):' }
};

// ── Server Lifecycle ────────────────────────────────────────────────────
connection.onInitialize(async (params: InitializeParams) => {
    if (params.initializationOptions && params.initializationOptions.wasmPath) {
        wasmPath = params.initializationOptions.wasmPath;
    }
    if (params.initializationOptions && params.initializationOptions.workspaceFolders) {
        workspaceFolders = params.initializationOptions.workspaceFolders;
    } else if (params.workspaceFolders) {
        workspaceFolders = params.workspaceFolders.map(f => uriToPath(f.uri));
    } else if (params.rootUri) {
        workspaceFolders = [uriToPath(params.rootUri)];
    }

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: ['.', '?', ':', '[', '(', '@', ' ']
            },
            hoverProvider: true,
            definitionProvider: true,
            declarationProvider: true,
            referencesProvider: true,
            documentSymbolProvider: true,
            workspaceSymbolProvider: true,
            signatureHelpProvider: {
                triggerCharacters: ['(', ',', '<', '['],
                retriggerCharacters: [',']
            },
            renameProvider: {
                prepareProvider: true
            },
            foldingRangeProvider: true
        }
    };
    return result;
});

connection.onInitialized(async () => {
    try {
        const wasmDir = path.dirname(require.resolve('web-tree-sitter'));
        await Parser.init({
            locateFile(scriptName: string) {
                return path.join(wasmDir, scriptName);
            }
        });
        if (!wasmPath) {
            const candidates = [
                path.join(__dirname, '..', 'tree-sitter-mantiq.wasm'),
                path.join(__dirname, 'tree-sitter-mantiq.wasm'),
                path.join(process.env.HOME || '', '.local', 'lib', 'mantiq', 'tree-sitter-mantiq.wasm'),
                '/usr/local/lib/mantiq/tree-sitter-mantiq.wasm'
            ];
            for (const cand of candidates) {
                if (fs.existsSync(cand)) {
                    wasmPath = cand;
                    break;
                }
            }
        }
        language = await Language.load(wasmPath);
        parser = new Parser();
        parser.setLanguage(language);
        connection.console.log(`Loaded Tree-sitter from ${wasmPath}`);

        // Index all open documents
        for (const doc of documents.all()) {
            indexDocument(doc);
            validateTextDocument(doc);
        }

        // Index workspace files asynchronously
        indexWorkspaceFiles();
    } catch (err) {
        connection.console.error(`Tree-sitter initialization error: ${err}`);
    }
});

// ── Document Event Listeners ────────────────────────────────────────────
documents.onDidChangeContent(change => {
    indexDocument(change.document);
    validateTextDocument(change.document);
});

documents.onDidClose(event => {
    const filePath = uriToPath(event.document.uri);
    if (!fs.existsSync(filePath)) {
        documentIndices.delete(event.document.uri);
    }
});

// ── AST Indexing & Extraction Engine ────────────────────────────────────
function indexDocument(textDocument: TextDocument): DocumentIndex | null {
    if (!parser) return null;

    try {
        const text = textDocument.getText();
        const tree = parser.parse(text);
        const symbols: ASTSymbol[] = [];
        const flatSymbols: ASTSymbol[] = [];
        const imports: ImportInfo[] = [];

        extractSymbolsFromNode(tree.rootNode, textDocument.uri, textDocument, symbols, flatSymbols, imports, undefined);

        const docIndex: DocumentIndex = {
            uri: textDocument.uri,
            symbols,
            flatSymbols,
            imports,
            tree,
            text
        };
        documentIndices.set(textDocument.uri, docIndex);
        return docIndex;
    } catch (err) {
        connection.console.error(`Index document error: ${err}`);
        return null;
    }
}

function cleanDocComment(raw: string): string {
    return raw
        .replace(/^\/\/[/!]?\s?/, '')
        .replace(/^\/\*[*!]?\s?/, '')
        .replace(/\s?\*\/$/, '')
        .replace(/^"""\s?/, '')
        .replace(/\s?"""$/, '')
        .replace(/^'''\s?/, '')
        .replace(/\s?'''$/, '')
        .trim();
}

function extractDocComment(node: any, doc: TextDocument): string | undefined {
    // 1. Inner Docstring: First child inside block_body, body, or enum_body
    const bodyNode = node.childForFieldName('body') ||
        node.children.find((c: any) => c.type === 'block_body' || c.type === 'body' || c.type === 'enum_body');
    if (bodyNode && bodyNode.childCount > 0) {
        for (let i = 0; i < bodyNode.childCount; i++) {
            const child = bodyNode.child(i);
            if (!child) continue;
            if (child.type === 'comment' || child.type === 'multiline_comment' || child.type === 'string' || child.type === 'string_literal') {
                const raw = child.text.trim();
                if (raw.startsWith('/*') || raw.startsWith('//') || raw.startsWith('"""') || raw.startsWith("'''")) {
                    const cleaned = cleanDocComment(raw);
                    if (cleaned.length > 0) {
                        return cleaned;
                    }
                }
            } else if (child.type !== '\n' && child.type !== 'indent' && child.type !== 'newline') {
                break;
            }
        }
    }

    // 2. Preceding Doc Comment: Attached lines directly preceding the declaration
    const startLine = node.startPosition.row;
    const docLines = doc.getText().split('\n');
    const precedingComments: string[] = [];

    let checkLine = startLine - 1;
    while (checkLine >= 0) {
        const lineText = docLines[checkLine].trim();
        if (lineText.length === 0) {
            break;
        }
        if (lineText.startsWith('@')) {
            checkLine--;
            continue;
        }
        if (lineText.startsWith('///') || lineText.startsWith('//') || lineText.startsWith('/*') || lineText.startsWith('*') || lineText.endsWith('*/')) {
            // Ignore generic section divider bars like "// ----------" or "// ========="
            if (!/^\/\/\s*[-=~#*]{3,}/.test(lineText)) {
                precedingComments.unshift(cleanDocComment(lineText));
            }
            checkLine--;
        } else {
            break;
        }
    }

    if (precedingComments.length > 0) {
        const fullComment = precedingComments.filter(c => c.length > 0).join('\n');
        if (fullComment.length > 0) {
            return fullComment;
        }
    }

    return undefined;
}

function nodeToRange(node: any): Range {
    return {
        start: { line: node.startPosition.row, character: node.startPosition.column },
        end: { line: node.endPosition.row, character: node.endPosition.column }
    };
}

function extractParams(typedParamsNode: any): SymbolParam[] {
    if (!typedParamsNode) return [];
    const params: SymbolParam[] = [];

    function processParamDecl(paramNode: any) {
        if (!paramNode) return;
        const nameNode = paramNode.childForFieldName('name') || paramNode.children.find((c: any) => c.type === 'identifier' || c.type === 'self_reference');
        let name = nameNode ? nameNode.text : '';
        if (!name && paramNode.text.includes('...')) {
            name = '...';
        }
        if (!name) return;

        const typeNode = paramNode.childForFieldName('type') || paramNode.children.find((c: any) => c.type === 'type_annotation');
        const typeStr = typeNode ? typeNode.text.replace(/^[:as]\s*/, '').trim() : undefined;
        const defNode = paramNode.childForFieldName('default_value');
        const defStr = defNode ? defNode.text.replace(/^=\s*/, '').trim() : undefined;

        params.push({
            name,
            type: typeStr,
            defaultValue: defStr
        });
    }

    if (typedParamsNode.type === 'typed_params' || typedParamsNode.type === 'lambda_typed_params') {
        for (const child of typedParamsNode.children) {
            if (child.type === 'param_decl' || child.type === 'identifier') {
                processParamDecl(child);
            }
        }
    } else if (typedParamsNode.type === 'param_decl') {
        processParamDecl(typedParamsNode);
    }
    return params;
}

function extractSymbolsFromNode(
    node: any,
    uri: string,
    doc: TextDocument,
    outSymbols: ASTSymbol[],
    flatSymbols: ASTSymbol[],
    outImports: ImportInfo[],
    containerName?: string
) {
    if (!node) return;

    for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (!child) continue;

        switch (child.type) {
            case 'extern_fn_decl':
            case 'fun_decl': {
                const namedFn = child.children.find((c: any) => c.type === 'named_function');
                if (namedFn) {
                    const idNode = namedFn.children.find((c: any) => c.type === 'identifier');
                    if (idNode) {
                        const name = idNode.text;
                        const typedParamsNode = namedFn.children.find((c: any) => c.type === 'typed_params');
                        const params = extractParams(typedParamsNode);
                        const returnNode = namedFn.children.find((c: any) => c.type === 'return_annotation');
                        const returnType = returnNode ? returnNode.text.replace(/^(->|as)\s*/, '').trim() : 'void';
                        const isMethod = containerName !== undefined;
                        const isAsync = child.children.some((c: any) => c.type === 'fun_modifier' && c.text === 'async');
                        const docComment = extractDocComment(child, doc);

                        const paramStrings = params.map(p => `${p.name}${p.type ? ` as ${p.type}` : ''}${p.defaultValue ? ` = ${p.defaultValue}` : ''}`).join(', ');
                        const detail = `${isAsync ? 'async ' : ''}fn ${name}(${paramStrings}) -> ${returnType}`;

                        const sym: ASTSymbol = {
                            name,
                            kind: isMethod ? SymbolKind.Method : SymbolKind.Function,
                            detail,
                            documentation: docComment,
                            range: nodeToRange(child),
                            selectionRange: nodeToRange(idNode),
                            scopeRange: nodeToRange(child),
                            uri,
                            containerName,
                            params,
                            returnType,
                            children: []
                        };

                        // Add parameters as local child symbols
                        for (const p of params) {
                            sym.children?.push({
                                name: p.name,
                                kind: SymbolKind.Variable,
                                detail: `parameter ${p.name}${p.type ? ` as ${p.type}` : ''}`,
                                range: sym.range,
                                selectionRange: sym.range,
                                scopeRange: sym.range,
                                uri,
                                containerName: name
                            });
                        }

                        // Traverse body for local declarations
                        const bodyNode = namedFn.children.find((c: any) => c.type === 'block_body' || c.type === 'expression');
                        if (bodyNode && sym.children) {
                            extractSymbolsFromNode(bodyNode, uri, doc, sym.children, flatSymbols, outImports, name);
                        }

                        outSymbols.push(sym);
                        flatSymbols.push(sym);
                    }
                }
                break;
            }

            case 'struct_decl': {
                const idNode = child.children.find((c: any) => c.type === 'identifier');
                if (idNode) {
                    const name = idNode.text;
                    const docComment = extractDocComment(child, doc);
                    const bodyNode = child.children.find((c: any) => c.type === 'block_body');
                    const sym: ASTSymbol = {
                        name,
                        kind: SymbolKind.Struct,
                        detail: `struct ${name}`,
                        documentation: docComment,
                        range: nodeToRange(child),
                        selectionRange: nodeToRange(idNode),
                        scopeRange: nodeToRange(child),
                        uri,
                        children: []
                    };
                    if (bodyNode && sym.children) {
                        extractSymbolsFromNode(bodyNode, uri, doc, sym.children, flatSymbols, outImports, name);
                    }
                    outSymbols.push(sym);
                    flatSymbols.push(sym);
                }
                break;
            }

            case 'class_decl': {
                const idNode = child.children.find((c: any) => c.type === 'identifier');
                if (idNode) {
                    const name = idNode.text;
                    const docComment = extractDocComment(child, doc);
                    const bodyNode = child.children.find((c: any) => c.type === 'block_body');
                    const sym: ASTSymbol = {
                        name,
                        kind: SymbolKind.Class,
                        detail: `class ${name}`,
                        documentation: docComment,
                        range: nodeToRange(child),
                        selectionRange: nodeToRange(idNode),
                        scopeRange: nodeToRange(child),
                        uri,
                        children: []
                    };
                    if (bodyNode && sym.children) {
                        extractSymbolsFromNode(bodyNode, uri, doc, sym.children, flatSymbols, outImports, name);
                    }
                    outSymbols.push(sym);
                    flatSymbols.push(sym);
                }
                break;
            }

            case 'interface_decl': {
                const idNode = child.children.find((c: any) => c.type === 'identifier');
                if (idNode) {
                    const name = idNode.text;
                    const docComment = extractDocComment(child, doc);
                    const bodyNode = child.children.find((c: any) => c.type === 'block_body');
                    const sym: ASTSymbol = {
                        name,
                        kind: SymbolKind.Interface,
                        detail: `interface ${name}`,
                        documentation: docComment,
                        range: nodeToRange(child),
                        selectionRange: nodeToRange(idNode),
                        scopeRange: nodeToRange(child),
                        uri,
                        children: []
                    };
                    if (bodyNode && sym.children) {
                        extractSymbolsFromNode(bodyNode, uri, doc, sym.children, flatSymbols, outImports, name);
                    }
                    outSymbols.push(sym);
                    flatSymbols.push(sym);
                }
                break;
            }

            case 'enum_decl': {
                const idNode = child.children.find((c: any) => c.type === 'identifier');
                if (idNode) {
                    const name = idNode.text;
                    const docComment = extractDocComment(child, doc);
                    const bodyNode = child.children.find((c: any) => c.type === 'enum_body');
                    const sym: ASTSymbol = {
                        name,
                        kind: SymbolKind.Enum,
                        detail: `enum ${name}`,
                        documentation: docComment,
                        range: nodeToRange(child),
                        selectionRange: nodeToRange(idNode),
                        scopeRange: nodeToRange(child),
                        uri,
                        children: []
                    };
                    if (bodyNode && sym.children) {
                        for (const enumChild of bodyNode.children) {
                            if (enumChild.type === 'enum_variant') {
                                const variantId = enumChild.children.find((c: any) => c.type === 'identifier');
                                if (variantId) {
                                    const variantSym: ASTSymbol = {
                                        name: variantId.text,
                                        kind: SymbolKind.EnumMember,
                                        detail: `${name}.${variantId.text}`,
                                        range: nodeToRange(enumChild),
                                        selectionRange: nodeToRange(variantId),
                                        scopeRange: nodeToRange(child),
                                        uri,
                                        containerName: name
                                    };
                                    sym.children.push(variantSym);
                                    flatSymbols.push(variantSym);
                                }
                            }
                        }
                    }
                    outSymbols.push(sym);
                    flatSymbols.push(sym);
                }
                break;
            }

            case 'union_decl': {
                const idNode = child.childForFieldName('name') || child.children.find((c: any) => c.type === 'identifier');
                if (idNode) {
                    const name = idNode.text;
                    const docComment = extractDocComment(child, doc);
                    const sym: ASTSymbol = {
                        name,
                        kind: SymbolKind.Struct,
                        detail: `union ${name}`,
                        documentation: docComment,
                        range: nodeToRange(child),
                        selectionRange: nodeToRange(idNode),
                        scopeRange: nodeToRange(child),
                        uri
                    };
                    outSymbols.push(sym);
                    flatSymbols.push(sym);
                }
                break;
            }

            case 'type_decl': {
                const idNode = child.children.find((c: any) => c.type === 'identifier');
                if (idNode) {
                    const name = idNode.text;
                    const docComment = extractDocComment(child, doc);
                    const sym: ASTSymbol = {
                        name,
                        kind: SymbolKind.TypeParameter,
                        detail: `type ${name}`,
                        documentation: docComment,
                        range: nodeToRange(child),
                        selectionRange: nodeToRange(idNode),
                        scopeRange: nodeToRange(child),
                        uri
                    };
                    outSymbols.push(sym);
                    flatSymbols.push(sym);
                }
                break;
            }

            case 'macro_decl': {
                const idNode = child.children.find((c: any) => c.type === 'identifier');
                if (idNode) {
                    const name = idNode.text;
                    const docComment = extractDocComment(child, doc);
                    const sym: ASTSymbol = {
                        name,
                        kind: SymbolKind.Function,
                        detail: `macro ${name}`,
                        documentation: docComment,
                        range: nodeToRange(child),
                        selectionRange: nodeToRange(idNode),
                        scopeRange: nodeToRange(child),
                        uri
                    };
                    outSymbols.push(sym);
                    flatSymbols.push(sym);
                }
                break;
            }

            case 'var_decl': {
                const isConst = child.text.startsWith('const');
                const isMut = child.text.includes('mut') || child.text.startsWith('var');
                const typeNode = child.children.find((c: any) => c.type === 'type_annotation');
                const typeStr = typeNode ? typeNode.text.replace(/^[:as]\s*/, '').trim() : undefined;

                for (const sub of child.children) {
                    if (sub.type === 'identifier' || sub.type === 'typed_var') {
                        const idNode = sub.type === 'identifier' ? sub : sub.children.find((c: any) => c.type === 'identifier');
                        if (idNode) {
                            const name = idNode.text;
                            const fieldType = sub.type === 'typed_var' ? sub.children.find((c: any) => c.type === 'type_annotation')?.text.replace(/^[:as]\s*/, '').trim() : typeStr;
                            const isField = containerName !== undefined;
                            const isTopLevel = containerName === undefined;
                            const detail = `${isConst ? 'const' : isMut ? 'var' : 'let'} ${name}${fieldType ? ` as ${fieldType}` : ''}`;
                            const sym: ASTSymbol = {
                                name,
                                kind: isField ? SymbolKind.Field : isConst ? SymbolKind.Constant : SymbolKind.Variable,
                                detail,
                                range: nodeToRange(child),
                                selectionRange: nodeToRange(idNode),
                                scopeRange: isTopLevel ? Range.create(0, 0, 999999, 0) : nodeToRange(child.parent || child),
                                uri,
                                containerName
                            };
                            outSymbols.push(sym);
                            flatSymbols.push(sym);
                        }
                    }
                }
                break;
            }

            case 'import_decl':
            case 'import_stmt': {
                const rawText = child.text;
                let modulePath = '';
                const importedSymbols: string[] = [];

                if (rawText.startsWith('from')) {
                    const match = rawText.match(/from\s+([a-zA-Z0-9_.]+)\s+import\s+(.+)/);
                    if (match) {
                        modulePath = match[1];
                        const syms = match[2].split(',').map((s: string) => s.trim());
                        importedSymbols.push(...syms);
                    }
                } else if (rawText.startsWith('import')) {
                    const match = rawText.match(/import\s+(?:\[[^\]]*\]\s*)?([a-zA-Z0-9_."/]+)(?:\s+as\s+([a-zA-Z0-9_]+))?/);
                    if (match) {
                        modulePath = match[1].replace(/["']/g, '');
                        if (match[2]) {
                            importedSymbols.push(match[2]);
                        } else {
                            importedSymbols.push(path.basename(modulePath, path.extname(modulePath)));
                        }
                    }
                }

                if (modulePath) {
                    outImports.push({
                        modulePath,
                        importedSymbols,
                        range: nodeToRange(child),
                        uri
                    });
                }
                break;
            }

            default: {
                if (child.childCount > 0 && child.type !== 'comment' && child.type !== 'string') {
                    extractSymbolsFromNode(child, uri, doc, outSymbols, flatSymbols, outImports, containerName);
                }
                break;
            }
        }
    }
}

// ── Workspace Scanning & Indexing ───────────────────────────────────────
async function indexWorkspaceFiles() {
    if (!parser) return;

    for (const folder of workspaceFolders) {
        scanDirectory(folder);
    }
}

function scanDirectory(dirPath: string) {
    try {
        if (!fs.existsSync(dirPath)) return;
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'out' || entry.name === 'dist') {
                continue;
            }
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                scanDirectory(fullPath);
            } else if (entry.isFile() && (entry.name.endsWith('.mq') || entry.name.endsWith('.nz'))) {
                const uri = pathToUri(fullPath);
                if (!documentIndices.has(uri)) {
                    try {
                        const content = fs.readFileSync(fullPath, 'utf8');
                        const doc = TextDocument.create(uri, entry.name.endsWith('.mq') ? 'mantiq' : 'nizam', 1, content);
                        indexDocument(doc);
                    } catch (e) {
                        connection.console.error(`Failed to read file ${fullPath}: ${e}`);
                    }
                }
            }
        }
    } catch (err) {
        connection.console.error(`Scan directory error for ${dirPath}: ${err}`);
    }
}

// ── AST Diagnostics / Syntax Errors ─────────────────────────────────────
async function validateTextDocument(textDocument: TextDocument): Promise<void> {
    if (!parser) return;

    const text = textDocument.getText();
    const tree = parser.parse(text);
    const diagnostics: Diagnostic[] = [];

    function walk(node: any) {
        const isMissing = typeof node.isMissing === 'function' ? node.isMissing() : Boolean(node.isMissing);
        const hasError = typeof node.hasError === 'function' ? node.hasError() : Boolean(node.hasError);

        if (node.type === 'ERROR' || isMissing) {
            const diagnostic: Diagnostic = {
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: node.startPosition.row, character: node.startPosition.column },
                    end: { line: node.endPosition.row, character: node.endPosition.column }
                },
                message: isMissing ? `Syntax error: missing ${node.type}` : `Syntax error: unexpected token '${node.text}'`,
                source: textDocument.languageId === 'nizam' ? 'nizam' : 'mantiq'
            };
            diagnostics.push(diagnostic);
        } else if (hasError) {
            for (const child of node.children) {
                walk(child);
            }
        }
    }

    const rootHasError = typeof tree.rootNode.hasError === 'function' ? tree.rootNode.hasError() : Boolean(tree.rootNode.hasError);
    if (rootHasError) {
        walk(tree.rootNode);
    }

    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

// ── Helper: Locate Node at Position ─────────────────────────────────────
function findNodeAtPosition(rootNode: any, line: number, character: number): any | null {
    if (!rootNode) return null;
    let current = rootNode;
    let found = true;

    while (found) {
        found = false;
        let bestChild: any = null;
        let smallestSpan = Infinity;

        for (let i = 0; i < current.childCount; i++) {
            const child = current.child(i);
            if (!child) continue;

            const startRow = child.startPosition.row;
            const startCol = child.startPosition.column;
            const endRow = child.endPosition.row;
            const endCol = child.endPosition.column;

            const startsBeforeOrAt = startRow < line || (startRow === line && startCol <= character);
            const endsAfterOrAt = endRow > line || (endRow === line && endCol >= character);

            if (startsBeforeOrAt && endsAfterOrAt) {
                const span = (endRow - startRow) * 10000 + (endCol - startCol);
                if (span <= smallestSpan) {
                    smallestSpan = span;
                    bestChild = child;
                }
            }
        }

        if (bestChild) {
            current = bestChild;
            found = true;
        }
    }
    return current;
}

// ── Auto-Completion Provider ────────────────────────────────────────────
connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return [];

    const lineText = doc.getText({
        start: { line: params.position.line, character: 0 },
        end: params.position
    });

    const items: CompletionItem[] = [];

    // ── Member Completion (after `.` or `?.`) ─────────────────────────────
    const memberMatch = lineText.match(/([a-zA-Z0-9_]+)(\??\.)([a-zA-Z0-9_]*)$/);
    if (memberMatch) {
        const receiver = memberMatch[1];
        const docIndex = documentIndices.get(params.textDocument.uri);

        // 1. If receiver is `self`, find enclosing class or struct
        if (receiver === 'self' && docIndex) {
            for (const sym of docIndex.flatSymbols) {
                if ((sym.kind === SymbolKind.Class || sym.kind === SymbolKind.Struct || sym.kind === SymbolKind.Interface) &&
                    isPositionInside(params.position, sym.range)) {
                    if (sym.children) {
                        for (const child of sym.children) {
                            items.push({
                                label: child.name,
                                kind: child.kind === SymbolKind.Method ? CompletionItemKind.Method : CompletionItemKind.Field,
                                detail: child.detail,
                                documentation: child.documentation
                            });
                        }
                    }
                }
            }
            if (items.length > 0) return items;
        }

        // 2. If receiver is an Enum name, return enum variants
        for (const index of documentIndices.values()) {
            for (const sym of index.flatSymbols) {
                if (sym.kind === SymbolKind.Enum && sym.name === receiver && sym.children) {
                    for (const variant of sym.children) {
                        items.push({
                            label: variant.name,
                            kind: CompletionItemKind.EnumMember,
                            detail: variant.detail
                        });
                    }
                }
            }
        }
        if (items.length > 0) return items;

        // 3. Built-in types member completions (e.g. String, List, Result, Option)
        if (receiver === 'String' || receiver === 'str') {
            return [
                { label: 'len', kind: CompletionItemKind.Method, detail: 'len() as usize' },
                { label: 'push', kind: CompletionItemKind.Method, detail: 'push(char) as void' },
                { label: 'append', kind: CompletionItemKind.Method, detail: 'append(str) as void' },
                { label: 'make', kind: CompletionItemKind.Method, detail: 'make(cstr) as String' }
            ];
        }
        if (receiver === 'List') {
            return [
                { label: 'len', kind: CompletionItemKind.Method, detail: 'len() as usize' },
                { label: 'push', kind: CompletionItemKind.Method, detail: 'push(item as T) as void' },
                { label: 'append', kind: CompletionItemKind.Method, detail: 'append(other as List[T]) as void' },
                { label: 'pop', kind: CompletionItemKind.Method, detail: 'pop() as Option[T]' }
            ];
        }
        if (receiver === 'Result') {
            return [
                { label: 'unwrap', kind: CompletionItemKind.Method, detail: 'unwrap() as T' },
                { label: 'is_ok', kind: CompletionItemKind.Method, detail: 'is_ok() as bool' },
                { label: 'is_err', kind: CompletionItemKind.Method, detail: 'is_err() as bool' }
            ];
        }
        if (receiver === 'Option') {
            return [
                { label: 'unwrap', kind: CompletionItemKind.Method, detail: 'unwrap() as T' },
                { label: 'is_some', kind: CompletionItemKind.Method, detail: 'is_some() as bool' },
                { label: 'is_none', kind: CompletionItemKind.Method, detail: 'is_none() as bool' }
            ];
        }

        // Return all known struct/class methods & fields across workspace as fallback
        const seenMembers = new Set<string>();
        for (const index of documentIndices.values()) {
            for (const sym of index.flatSymbols) {
                if (sym.kind === SymbolKind.Method || sym.kind === SymbolKind.Field) {
                    if (!seenMembers.has(sym.name)) {
                        seenMembers.add(sym.name);
                        items.push({
                            label: sym.name,
                            kind: sym.kind === SymbolKind.Method ? CompletionItemKind.Method : CompletionItemKind.Field,
                            detail: sym.detail,
                            documentation: sym.documentation
                        });
                    }
                }
            }
        }
        return items;
    }

    // ── Normal Symbol & Keyword Completions ────────────────────────────────
    const seenNames = new Set<string>();

    // 1. In-Scope Document Symbols & Workspace Symbols
    for (const index of documentIndices.values()) {
        const isCurrentDoc = index.uri === params.textDocument.uri;
        for (const sym of index.flatSymbols) {
            if (!seenNames.has(sym.name)) {
                // Check scope: if local variable, only include if in scope
                if (sym.kind === SymbolKind.Variable && !isCurrentDoc) {
                    continue;
                }
                seenNames.add(sym.name);
                items.push({
                    label: sym.name,
                    kind: symbolKindToCompletionKind(sym.kind),
                    detail: sym.detail,
                    documentation: sym.documentation
                });
            }
        }
    }

    // 2. Built-in Types
    for (const [typeName, info] of Object.entries(BUILTIN_TYPES)) {
        if (!seenNames.has(typeName)) {
            seenNames.add(typeName);
            items.push({
                label: typeName,
                kind: CompletionItemKind.Class,
                detail: info.detail,
                documentation: info.desc
            });
        }
    }

    // 3. Built-in Functions & Utilities
    for (const [fnName, info] of Object.entries(BUILTIN_FUNCTIONS)) {
        if (!seenNames.has(fnName)) {
            seenNames.add(fnName);
            items.push({
                label: fnName,
                kind: CompletionItemKind.Function,
                detail: info.sig,
                documentation: info.doc
            });
        }
    }

    // 4. Keywords
    for (const [kw, info] of Object.entries(KEYWORDS_DOCS)) {
        if (!seenNames.has(kw)) {
            seenNames.add(kw);
            items.push({
                label: kw,
                kind: CompletionItemKind.Keyword,
                detail: info.detail,
                documentation: info.desc
            });
        }
    }

    // 5. Code Snippets
    items.push(
        {
            label: 'fn',
            kind: CompletionItemKind.Snippet,
            detail: 'Function definition snippet',
            insertText: 'fn ${1:name}(${2:params}) -> ${3:void}:\n\t${0:pass}',
            insertTextFormat: InsertTextFormat.Snippet
        },
        {
            label: 'struct',
            kind: CompletionItemKind.Snippet,
            detail: 'Struct definition snippet',
            insertText: 'struct ${1:Name}:\n\tfn __init__(ref mut self${2:, params}):\n\t\t${0:pass}',
            insertTextFormat: InsertTextFormat.Snippet
        },
        {
            label: 'class',
            kind: CompletionItemKind.Snippet,
            detail: 'Class definition snippet',
            insertText: 'class ${1:Name}:\n\tfn __init__(ref mut self${2:, params}):\n\t\t${0:pass}',
            insertTextFormat: InsertTextFormat.Snippet
        },
        {
            label: 'interface',
            kind: CompletionItemKind.Snippet,
            detail: 'Interface definition snippet',
            insertText: 'interface ${1:Name}:\n\tabstract fn ${2:method}(ref self) as ${3:void}',
            insertTextFormat: InsertTextFormat.Snippet
        },
        {
            label: 'enum',
            kind: CompletionItemKind.Snippet,
            detail: 'Enum definition snippet',
            insertText: 'enum ${1:Name}:\n\t${2:Variant1},\n\t${3:Variant2}',
            insertTextFormat: InsertTextFormat.Snippet
        },
        {
            label: 'for',
            kind: CompletionItemKind.Snippet,
            detail: 'For-in loop snippet',
            insertText: 'for ${1:item} in ${2:iterable}:\n\t${0:pass}',
            insertTextFormat: InsertTextFormat.Snippet
        },
        {
            label: 'while',
            kind: CompletionItemKind.Snippet,
            detail: 'While loop snippet',
            insertText: 'while ${1:condition}:\n\t${0:pass}',
            insertTextFormat: InsertTextFormat.Snippet
        },
        {
            label: 'match',
            kind: CompletionItemKind.Snippet,
            detail: 'Match pattern statement snippet',
            insertText: 'match ${1:expr}:\n\tcase ${2:pattern}:\n\t\t${0:pass}',
            insertTextFormat: InsertTextFormat.Snippet
        },
        {
            label: 'try',
            kind: CompletionItemKind.Snippet,
            detail: 'Try-except error handling snippet',
            insertText: 'try:\n\t${1:pass}\nexcept ${2:Error} as ${3:e}:\n\t${0:print(e)}',
            insertTextFormat: InsertTextFormat.Snippet
        }
    );

    return items;
});

connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
    return item;
});

function isPositionInside(pos: Position, range: Range): boolean {
    if (pos.line < range.start.line || pos.line > range.end.line) return false;
    if (pos.line === range.start.line && pos.character < range.start.character) return false;
    if (pos.line === range.end.line && pos.character > range.end.character) return false;
    return true;
}

function symbolKindToCompletionKind(kind: SymbolKind): CompletionItemKind {
    switch (kind) {
        case SymbolKind.Function: return CompletionItemKind.Function;
        case SymbolKind.Method: return CompletionItemKind.Method;
        case SymbolKind.Class: return CompletionItemKind.Class;
        case SymbolKind.Struct: return CompletionItemKind.Struct;
        case SymbolKind.Interface: return CompletionItemKind.Interface;
        case SymbolKind.Enum: return CompletionItemKind.Enum;
        case SymbolKind.EnumMember: return CompletionItemKind.EnumMember;
        case SymbolKind.Field: return CompletionItemKind.Field;
        case SymbolKind.Variable: return CompletionItemKind.Variable;
        case SymbolKind.Constant: return CompletionItemKind.Constant;
        case SymbolKind.TypeParameter: return CompletionItemKind.TypeParameter;
        default: return CompletionItemKind.Variable;
    }
}

// ── Go to Definition & Declaration ──────────────────────────────────────
function getOrCreateIndex(uri: string): DocumentIndex | null {
    const doc = documents.get(uri);
    if (doc) {
        const existing = documentIndices.get(uri);
        if (!existing || !existing.tree || existing.text !== doc.getText()) {
            return indexDocument(doc);
        }
        return existing;
    }
    let index = documentIndices.get(uri);
    if (!index || !index.tree) {
        const fsPath = uriToPath(uri);
        if (fs.existsSync(fsPath)) {
            try {
                const text = fs.readFileSync(fsPath, 'utf8');
                const textDoc = TextDocument.create(uri, fsPath.endsWith('.nz') ? 'nizam' : 'mantiq', 1, text);
                index = indexDocument(textDoc) || undefined;
            } catch (e) {
                connection.console.error(`Failed to read file ${fsPath}: ${e}`);
            }
        }
    }
    return index || null;
}

// ── Go to Definition & Declaration ──────────────────────────────────────
connection.onDefinition((params: TextDocumentPositionParams): Definition | null => {
    return resolveDefinition(params);
});

connection.onDeclaration((params: TextDocumentPositionParams): Definition | null => {
    return resolveDefinition(params);
});

function resolveDefinition(params: TextDocumentPositionParams): Definition | null {
    const docIndex = getOrCreateIndex(params.textDocument.uri);
    if (!docIndex || !docIndex.tree) return null;

    const node = findNodeAtPosition(docIndex.tree.rootNode, params.position.line, params.position.character);
    if (!node) return null;

    let targetText = node.text;
    if (node.parent && node.parent.type === 'member_expression') {
        const propNode = node.parent.childForFieldName('property');
        if (propNode && (node === propNode || node.text === propNode.text)) {
            targetText = propNode.text;
        }
    }

    // 1. Check if node is an identifier in an import statement
    for (const imp of docIndex.imports) {
        if (imp.importedSymbols.includes(targetText) || imp.modulePath.includes(targetText)) {
            // Find target file in workspace
            for (const [uri, index] of documentIndices.entries()) {
                const targetFilePath = uriToPath(uri);
                const fileName = path.basename(targetFilePath, path.extname(targetFilePath));
                if (imp.modulePath.endsWith(fileName) || imp.modulePath === fileName) {
                    const match = index.flatSymbols.find(s => s.name === targetText);
                    if (match) {
                        return Location.create(uri, match.selectionRange);
                    }
                    return Location.create(uri, Range.create(0, 0, 0, 0));
                }
            }
        }
    }

    // 2. Check local symbols in current document (scoped)
    for (const sym of docIndex.flatSymbols) {
        if (sym.name === targetText) {
            // If it's a local variable or parameter inside a function/method, verify cursor is in scope
            if (sym.containerName && (sym.kind === SymbolKind.Variable || sym.kind === SymbolKind.Field)) {
                if (!isPositionInside(params.position, sym.scopeRange)) {
                    continue;
                }
            }
            return Location.create(docIndex.uri, sym.selectionRange);
        }
    }

    // 3. Check workspace symbols across all documents
    for (const [uri, index] of documentIndices.entries()) {
        for (const sym of index.flatSymbols) {
            if (sym.name === targetText) {
                return Location.create(uri, sym.selectionRange);
            }
        }
    }

    return null;
}

// ── Find References ─────────────────────────────────────────────────────
connection.onReferences((params: ReferenceParams): Location[] => {
    const docIndex = documentIndices.get(params.textDocument.uri);
    if (!docIndex || !docIndex.tree) return [];

    const node = findNodeAtPosition(docIndex.tree.rootNode, params.position.line, params.position.character);
    if (!node) return [];

    const targetName = node.text;
    const locations: Location[] = [];

    for (const [uri, index] of documentIndices.entries()) {
        if (!index.tree) continue;

        function walk(n: any) {
            if (n.type === 'identifier' && n.text === targetName) {
                locations.push(Location.create(uri, nodeToRange(n)));
            }
            for (let i = 0; i < n.childCount; i++) {
                walk(n.child(i));
            }
        }
        walk(index.tree.rootNode);
    }

    return locations;
});

// ── Document Symbols / Outline ──────────────────────────────────────────
connection.onDocumentSymbol((params: DocumentSymbolParams): DocumentSymbol[] => {
    const docIndex = getOrCreateIndex(params.textDocument.uri);
    if (!docIndex) return [];

    function toDocumentSymbol(sym: ASTSymbol): DocumentSymbol {
        return {
            name: sym.name,
            detail: sym.detail,
            kind: sym.kind,
            range: sym.range,
            selectionRange: sym.selectionRange,
            children: sym.children ? sym.children.map(toDocumentSymbol) : undefined
        };
    }

    return docIndex.symbols.map(toDocumentSymbol);
});

// ── Workspace Symbols ───────────────────────────────────────────────────
connection.onWorkspaceSymbol((params: WorkspaceSymbolParams) => {
    const query = params.query.toLowerCase();
    const results: any[] = [];

    for (const [uri, index] of documentIndices.entries()) {
        for (const sym of index.flatSymbols) {
            if (sym.name.toLowerCase().includes(query)) {
                results.push({
                    name: sym.name,
                    kind: sym.kind,
                    location: Location.create(uri, sym.selectionRange),
                    containerName: sym.containerName
                });
            }
        }
    }
    return results;
});

// ── Signature Help ──────────────────────────────────────────────────────
connection.onSignatureHelp((params: TextDocumentPositionParams): SignatureHelp | null => {
    const docIndex = getOrCreateIndex(params.textDocument.uri);
    if (!docIndex || !docIndex.tree) return null;

    const node = findNodeAtPosition(docIndex.tree.rootNode, params.position.line, params.position.character);
    if (!node) return null;

    // Find enclosing call_expression
    let current = node;
    let callExpr: any = null;
    while (current) {
        if (current.type === 'call_expression') {
            callExpr = current;
            break;
        }
        current = current.parent;
    }

    if (!callExpr) return null;

    // Extract function identifier
    const fnNode = callExpr.childForFieldName('function') || callExpr.children[0];
    const fnName = fnNode ? fnNode.text.replace(/^.*\./, '') : '';

    // Count active argument index by inspecting commas before cursor
    let activeParam = 0;
    const argsNode = callExpr.children.find((c: any) => c.type === 'arguments' || c.type === 'collection_item');
    if (argsNode) {
        for (let i = 0; i < argsNode.childCount; i++) {
            const child = argsNode.child(i);
            if (child.text === ',' && (child.startPosition.row < params.position.line || (child.startPosition.row === params.position.line && child.startPosition.column < params.position.character))) {
                activeParam++;
            }
        }
    }

    // Lookup function in symbol table or built-ins
    let sigInfo: SignatureInformation | null = null;

    // 1. Built-in Functions
    if (BUILTIN_FUNCTIONS[fnName]) {
        const builtin = BUILTIN_FUNCTIONS[fnName];
        sigInfo = {
            label: builtin.sig,
            documentation: builtin.doc,
            parameters: builtin.params.map(p => ({ label: p }))
        };
    }

    // 2. User-Defined Functions
    if (!sigInfo) {
        for (const index of documentIndices.values()) {
            const match = index.flatSymbols.find(s => s.name === fnName && (s.kind === SymbolKind.Function || s.kind === SymbolKind.Method));
            if (match && match.params) {
                const paramInfos: ParameterInformation[] = match.params.map(p => ({
                    label: `${p.name}${p.type ? ` as ${p.type}` : ''}${p.defaultValue ? ` = ${p.defaultValue}` : ''}`,
                    documentation: p.doc
                }));
                sigInfo = {
                    label: match.detail,
                    documentation: match.documentation,
                    parameters: paramInfos
                };
                break;
            }
        }
    }

    if (sigInfo) {
        return {
            signatures: [sigInfo],
            activeSignature: 0,
            activeParameter: Math.min(activeParam, (sigInfo.parameters?.length || 1) - 1)
        };
    }

    return null;
});

// ── Hover Information ───────────────────────────────────────────────────
connection.onHover((params: TextDocumentPositionParams): Hover | null => {
    const docIndex = getOrCreateIndex(params.textDocument.uri);
    if (!docIndex || !docIndex.tree) return null;

    const node = findNodeAtPosition(docIndex.tree.rootNode, params.position.line, params.position.character);
    if (!node) return null;

    let text = node.text;
    if (node.parent && node.parent.type === 'member_expression') {
        const propNode = node.parent.childForFieldName('property');
        if (propNode && (node === propNode || node.text === propNode.text)) {
            text = propNode.text;
        }
    }

    // 1. Built-in Types Hover
    if (BUILTIN_TYPES[text]) {
        const t = BUILTIN_TYPES[text];
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: `\`\`\`mantiq\n${t.detail}\n\`\`\`\n\n${t.desc}`
            }
        };
    }

    // 2. Built-in Functions Hover
    if (BUILTIN_FUNCTIONS[text]) {
        const f = BUILTIN_FUNCTIONS[text];
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: `\`\`\`mantiq\n${f.sig}\n\`\`\`\n\n${f.doc}`
            }
        };
    }

    // 3. Keywords Hover
    if (KEYWORDS_DOCS[text]) {
        const k = KEYWORDS_DOCS[text];
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: `**Keyword**: \`${text}\`\n\n\`\`\`mantiq\n${k.detail}\n\`\`\`\n\n${k.desc}`
            }
        };
    }

    // 4. Symbol Table Lookup (Functions, Structs, Classes, Variables, Fields, Enums)
    const localMatch = docIndex.flatSymbols.find(s => s.name === text);
    const match = localMatch || Array.from(documentIndices.values()).flatMap(i => i.flatSymbols).find(s => s.name === text);
    if (match) {
        let md = `\`\`\`mantiq\n${match.detail}\n\`\`\``;
        if (match.documentation) {
            md += `\n\n${match.documentation}`;
        }
        if (match.containerName) {
            md += `\n\n*Member of* \`${match.containerName}\``;
        }
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: md
            }
        };
    }

    // 5. Fallback: AST Node Information
    if (node.type && node.type !== 'identifier') {
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: `**Mantiq AST**: \`${node.type}\`\n\n\`\`\`mantiq\n${node.text.substring(0, 100)}${node.text.length > 100 ? '...' : ''}\n\`\`\``
            }
        };
    }

    return null;
});

// ── Rename Provider ─────────────────────────────────────────────────────
connection.onPrepareRename((params: TextDocumentPositionParams): { range: Range; placeholder: string } | null => {
    const docIndex = getOrCreateIndex(params.textDocument.uri);
    if (!docIndex || !docIndex.tree) return null;

    let node = findNodeAtPosition(docIndex.tree.rootNode, params.position.line, params.position.character);
    if (!node) return null;

    if (node.type !== 'identifier') {
        const idChild = node.children.find((c: any) => c.type === 'identifier');
        if (idChild) {
            node = idChild;
        } else if (node.parent && node.parent.type === 'identifier') {
            node = node.parent;
        } else {
            return null;
        }
    }

    return {
        range: nodeToRange(node),
        placeholder: node.text
    };
});

interface IdentifierRole {
    kind: 'type' | 'field' | 'function' | 'local' | 'general';
    enclosingFunction?: any;
    enclosingClass?: any;
}

function classifyIdentifier(node: any): IdentifierRole {
    if (!node) return { kind: 'general' };

    let inTypeAnnotation = false;
    let isMemberProperty = false;
    let isCallFunction = false;
    let isFunDeclName = false;
    let isTypeDeclName = false;
    let isFieldDecl = false;
    let isParamName = false;
    let isVarDecl = false;
    let enclosingFunction: any = null;
    let enclosingClass: any = null;

    // First pass: locate enclosing scope structures
    let p = node.parent;
    while (p) {
        if (!enclosingFunction && (p.type === 'fun_decl' || p.type === 'named_function')) {
            enclosingFunction = p;
        }
        if (!enclosingClass && (p.type === 'class_decl' || p.type === 'struct_decl' || p.type === 'interface_decl' || p.type === 'enum_decl' || p.type === 'union_decl' || p.type === 'type_decl')) {
            enclosingClass = p;
        }
        p = p.parent;
    }

    let curr = node.parent;
    while (curr) {
        if (curr.type === 'type_annotation' || curr.type === 'return_annotation' || curr.type === 'generic_type') {
            inTypeAnnotation = true;
        }
        if (curr.type === 'member_expression') {
            const children = curr.children;
            if (children[children.length - 1] === node || (children[children.length - 1] && children[children.length - 1].text === node.text)) {
                isMemberProperty = true;
            }
        }
        if (curr.type === 'call_expression') {
            const fn = curr.childForFieldName('function') || curr.children[0];
            if (fn === node || (fn && fn.startPosition.column === node.startPosition.column && fn.endPosition.column === node.endPosition.column)) {
                isCallFunction = true;
            }
        }
        if (curr.type === 'named_function' || curr.type === 'fun_decl') {
            const id = curr.children.find((c: any) => c.type === 'identifier');
            if (id === node || (id && id.startPosition.column === node.startPosition.column && id.endPosition.column === node.endPosition.column)) {
                isFunDeclName = true;
            }
        }
        if (curr.type === 'class_decl' || curr.type === 'struct_decl' || curr.type === 'interface_decl' || curr.type === 'enum_decl' || curr.type === 'union_decl' || curr.type === 'type_decl') {
            const id = curr.children.find((c: any) => c.type === 'identifier');
            if (id === node || (id && id.startPosition.column === node.startPosition.column && id.endPosition.column === node.endPosition.column)) {
                isTypeDeclName = true;
            }
            if (curr.type === 'class_decl' && !isTypeDeclName && !inTypeAnnotation) {
                const colon = curr.children.find((c: any) => c.text === ':');
                if (colon && node.startPosition.row <= colon.startPosition.row) {
                    inTypeAnnotation = true;
                }
            }
        }
        if (curr.type === 'var_decl') {
            const id = curr.children.find((c: any) => c.type === 'identifier');
            if ((id === node || (id && id.startPosition.column === node.startPosition.column && id.endPosition.column === node.endPosition.column)) && !inTypeAnnotation) {
                if (enclosingClass && !enclosingFunction) {
                    isFieldDecl = true;
                } else {
                    isVarDecl = true;
                }
            }
        }
        if (curr.type === 'param_decl') {
            const id = curr.children.find((c: any) => c.type === 'identifier');
            if ((id === node || (id && id.startPosition.column === node.startPosition.column && id.endPosition.column === node.endPosition.column)) && !inTypeAnnotation) {
                isParamName = true;
            }
        }
        if (curr.type === 'match_case') {
            const isKw = curr.children.find((c: any) => c.text === 'is');
            if (isKw && curr.children.indexOf(isKw) < curr.children.indexOf(node)) {
                inTypeAnnotation = true;
            }
        }
        curr = curr.parent;
    }

    if (inTypeAnnotation || isTypeDeclName) return { kind: 'type', enclosingFunction, enclosingClass };
    if (isFieldDecl || isMemberProperty) return { kind: 'field', enclosingFunction, enclosingClass };
    if (isFunDeclName || isCallFunction) return { kind: 'function', enclosingFunction, enclosingClass };
    if (isParamName || isVarDecl) return { kind: 'local', enclosingFunction, enclosingClass };
    return { kind: 'general', enclosingFunction, enclosingClass };
}

connection.onRenameRequest((params: RenameParams): WorkspaceEdit | null => {
    connection.console.log(`[RenameRequest] Received for ${params.textDocument.uri} at ${params.position.line}:${params.position.character} with newName: "${params.newName}"`);
    const docIndex = getOrCreateIndex(params.textDocument.uri);
    if (!docIndex || !docIndex.tree) return null;

    let node = findNodeAtPosition(docIndex.tree.rootNode, params.position.line, params.position.character);
    if (!node) return null;

    if (node.type !== 'identifier') {
        const idChild = node.children.find((c: any) => c.type === 'identifier');
        if (idChild) {
            node = idChild;
        } else if (node.parent && node.parent.type === 'identifier') {
            node = node.parent;
        }
    }

    let oldName = node ? node.text : '';
    const newName = params.newName.trim();
    if (oldName === '' || newName === '' || oldName === newName) return null;

    const targetClass = classifyIdentifier(node);
    connection.console.log(`[RenameRequest] Target symbol "${oldName}" classified as kind: ${targetClass.kind}`);

    const changes: { [uri: string]: TextEdit[] } = {};

    for (const [uri, index] of documentIndices.entries()) {
        if (!index.tree) continue;
        const edits: TextEdit[] = [];
        const seenRanges = new Set<string>();

        function walk(n: any) {
            if (n.type === 'identifier' && n.text === oldName) {
                const nClass = classifyIdentifier(n);
                let shouldRename = false;

                if (targetClass.kind === 'type') {
                    if (nClass.kind === 'type' || (nClass.kind === 'function' && !nClass.enclosingClass)) {
                        shouldRename = true;
                    }
                } else if (targetClass.kind === 'field') {
                    if (nClass.kind === 'field') {
                        shouldRename = true;
                    }
                } else if (targetClass.kind === 'function') {
                    if (nClass.kind === 'function') {
                        shouldRename = true;
                    }
                } else if (targetClass.kind === 'local') {
                    if (uri === params.textDocument.uri && nClass.enclosingFunction === targetClass.enclosingFunction && nClass.kind !== 'type') {
                        shouldRename = true;
                    }
                } else {
                    if (nClass.kind === targetClass.kind) {
                        shouldRename = true;
                    }
                }

                if (shouldRename) {
                    const r = nodeToRange(n);
                    const key = `${r.start.line}:${r.start.character}:${r.end.line}:${r.end.character}`;
                    if (!seenRanges.has(key)) {
                        seenRanges.add(key);
                        edits.push(TextEdit.replace(r, newName));
                    }
                }
            }

            for (let i = 0; i < n.childCount; i++) {
                walk(n.child(i));
            }
        }

        walk(index.tree.rootNode);

        if (edits.length > 0) {
            edits.sort((a, b) => {
                if (b.range.start.line !== a.range.start.line) {
                    return b.range.start.line - a.range.start.line;
                }
                return b.range.start.character - a.range.start.character;
            });
            changes[uri] = edits;
        }
    }

    return { changes };
});

// ── Folding Ranges Provider ─────────────────────────────────────────────
connection.onFoldingRanges((params: FoldingRangeParams): FoldingRange[] => {
    const docIndex = getOrCreateIndex(params.textDocument.uri);
    if (!docIndex || !docIndex.tree) return [];

    const ranges: FoldingRange[] = [];

    function walk(node: any) {
        if (!node) return;

        const isFoldableBlock = [
            'block_body', 'enum_body', 'struct_decl', 'class_decl',
            'interface_decl', 'fun_decl', 'match_stmt', 'try_stmt',
            'if_stmt', 'for_stmt', 'while_stmt'
        ].includes(node.type);

        if (isFoldableBlock && node.startPosition.row < node.endPosition.row) {
            ranges.push({
                startLine: node.startPosition.row,
                endLine: node.endPosition.row,
                kind: FoldingRangeKind.Region
            });
        } else if (node.type === 'comment' && node.startPosition.row < node.endPosition.row) {
            ranges.push({
                startLine: node.startPosition.row,
                endLine: node.endPosition.row,
                kind: FoldingRangeKind.Comment
            });
        }

        for (let i = 0; i < node.childCount; i++) {
            walk(node.child(i));
        }
    }

    walk(docIndex.tree.rootNode);
    return ranges;
});

// ── Start Server ────────────────────────────────────────────────────────
documents.listen(connection);
connection.listen();
