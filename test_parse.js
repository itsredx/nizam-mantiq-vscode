const path = require('path');
const { Parser, Language } = require('web-tree-sitter');

async function test() {
    try {
        await Parser.init();
        const wasmPath = path.join(__dirname, 'tree-sitter-mantiq.wasm');
        const Mantiq = await Language.load(wasmPath);
        const parser = new Parser();
        parser.setLanguage(Mantiq);

        const code1 = `
struct Test:
    fn deinit(self as ptr[Test]):
        if (deref self).data to ptr != None:
            drop((deref self).data to ptr)
            (deref self).data = None to ptr[u8]

    fn foo(self as ptr[Test], other as ptr[Test]):
        pass
`;
        const tree1 = parser.parse(code1);
        console.log("deinit + foo:", tree1.rootNode.toString().includes('ERROR') ? 'ERROR' : 'OK');

        const code2 = `
struct String:
    fn deinit(self as ptr[String]):
        if (deref self).data to ptr != None:
            drop((deref self).data to ptr)
            (deref self).data = None to ptr[u8]

    fn append(self as ptr[String], other as ptr[String]):
        let new_len = (deref self).len + (deref other).len
        if new_len >= (deref self).capacity:
            let new_cap = (new_len + 1) * 2
            (deref self).data = resize((deref self).data to ptr, new_cap) to ptr[u8]
            (deref self).capacity = new_cap
        
        let dest_ptr = ref (deref self).data[(deref self).len]
        memcpy(dest_ptr to ptr, (deref other).data to ptr, (deref other).len + 1)
        (deref self).len = new_len
`;
        const tree2 = parser.parse(code2);
        console.log("deinit + append:", tree2.rootNode.toString().includes('ERROR') ? 'ERROR' : 'OK');
    } catch (e) {
        console.error("ERROR:", e);
    }
}
test();
