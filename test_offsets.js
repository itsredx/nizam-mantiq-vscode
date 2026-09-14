const code = `
struct Test:
    fn deinit(self as ptr[Test]):
        if (deref self).data to ptr != None:
            drop((deref self).data to ptr)
            (deref self).data = None to ptr[u8]

    fn foo(self as ptr[Test], other as ptr[Test]):
        pass
`;
const buf = Buffer.from(code, 'utf8');
const target = "ptr[u8]";
const idx = code.indexOf(target);
const start = idx + target.length;
const end = code.indexOf("fn foo");
console.log("Bytes between:", end - start);
for (let i = start; i < end; i++) {
    console.log(`idx=${i}, char=${JSON.stringify(code[i])}, code=${code.charCodeAt(i)}`);
}
