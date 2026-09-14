; ── Keywords ─────────────────────────────────────────────────────────
[
  "if" "else" "elif"
  "for" "while" "break" "continue"
  "let" "mut" "ref" "as" "const"
  "return" "spawn" "pass" "raise"
  "fn" "class" "interface" "struct" "enum" "union" "type" "macro"
  "import" "from" "link"
  "abstract" "public" "private" "protected" "internal"
  "life" "var" "async" "await" "deref" "block" "inline"
  "static" "extern" "volatile" "atomic"
  "super" "size"
  "override" "final" "gpu" "vec" "par" "@vec" "@par"
] @keyword

(access_modifier) @keyword
(kw_and) @keyword
(kw_or) @keyword
(kw_is) @keyword
(kw_to) @keyword
(kw_unsafe) @keyword
(kw_in) @keyword
(kw_not) @keyword
(kw_match) @keyword
(kw_case) @keyword
(kw_try) @keyword
(kw_except) @keyword
(kw_finally) @keyword
(kw_with) @keyword

((identifier) @keyword
 (#match? @keyword "^(fn|public|private|internal|protected|var|let|const|struct|enum|interface|trait|impl|type|alias|as|to|mut|ref|deref|return|if|elif|else|while|for|loop|match|case|break|continue|defer|spawn|await|yield|unsafe|import|from|link|pass|raise|with|try|except|finally|size|ptr)$"))

(self_reference) @keyword
(decorator) @decorator

; ── Types ────────────────────────────────────────────────────────────
(type_annotation (identifier) @type)
(return_annotation (identifier) @type)
(type_decl (identifier) @type)

((identifier) @type
 (#match? @type "^(i8|i16|i32|i64|i128|i256|i512|i1024|u8|u16|u32|u64|u128|u256|u512|u1024|isize|usize|f16|bf16|f32|f64|f128|f256|f512|bool|char|byte|str|cstr|webstr|asciistr|rangestr|utf8str|ptr|void|Any|String|Option|List|Dict|Set|Result|Codepoint|PyObject)$"))

; ── Variables & Identifiers ──────────────────────────────────────────
(identifier) @variable

(member_expression
  property: (identifier) @property)

(named_function (identifier) @function)

; ── Literals & Comments ──────────────────────────────────────────────
(string) @string
(string_start) @string
(string_content) @string
(string_end) @string
(number) @number
(boolean_literal) @boolean
(null_literal) @constant.builtin
(color_literal) @string
(quantum_literal) @string

(comment) @comment

(interpolation "{" @punctuation.special "}" @punctuation.special)

(import_decl tag: (identifier) @keyword)
(link_decl tag: (identifier) @keyword)

; ── Extern Declarations ──────────────────────────────────────────────
(extern_block "extern" @keyword)
(extern_block tag: (identifier) @keyword)
(extern_block module: (string) @string)
(extern_block module: (identifier) @variable)

(extern_fn_decl "extern" @keyword)
(extern_fn_decl tag: (identifier) @keyword)
(extern_fn_decl module: (string) @string)
(extern_fn_decl module: (identifier) @variable)
(extern_fn_decl "fn" @keyword)

