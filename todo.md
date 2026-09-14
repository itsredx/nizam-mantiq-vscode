Based on your Mantiq syntax, I would avoid assigning colors to every keyword individually. Instead, group tokens by their semantic role, like Rust, Zig, Swift, and modern JetBrains themes do. This makes code much easier to scan.

## 1. Keywords (Purple)

These define the structure of the language.

```text
import
from
extern
fn
struct
enum
interface
trait
impl
type
alias
let
var
const
return
if
elif
else
while
for
loop
match
case
break
continue
defer
spawn
await
yield
public
private
internal
unsafe
```

Suggested color:

```
#C792EA (Purple)
```

---

## 2. Declaration Names (Blue)

Identifiers that introduce new symbols.

```text
Diagnostic
DiagnosticEngine
Label
Severity
Suggestion
String
Span
Option
List
printf
malloc
render_diagnostic
new
make
```

These should only be blue when being declared.

Example

```mantiq
struct Diagnostic
fn render()
enum Severity
```

Suggested

```
#82AAFF
```

---

## 3. Types (Yellow)

Built-in and user-defined types.

Builtins

```text
i8
i16
i32
i64

u8
u16
u32
u64

f32
f64

bool
char
str
cstr
ptr
usize
void
```

User Types

```text
Diagnostic
Span
Label
String
Option
List
Severity
```

Example

```mantiq
let x as u32
```

Only `u32` is yellow.

Suggested

```
#FFCB6B
```

---

## 4. Type Qualifiers (Purple)

These modify types.

```text
as
to
mut
ref
move
owned
shared
weak
```

Example

```mantiq
let x as ptr[String]
```

Suggested

```
#C792EA
```

---

## 5. Literals (Orange)

```text
10
3.14
true
false
None
null
```

Suggested

```
#F78C6C
```

---

## 6. Strings (Green)

```mantiq
"hello"
"world"
```

Suggested

```
#C3E88D
```

---

## 7. Characters (Light Green)

```mantiq
'a'
'\n'
```

Suggested

```
#A5E075
```

---

## 8. Comments (Gray)

```text
// comment

/*
 block
*/
```

Suggested

```
#676E95
```

---

## 9. Functions (Blue)

Any callable.

Examples from your file:

```text
printf
malloc
free
strlen

new
make

render_diagnostic
emit_all

append
unwrap
is_some
len
get
```

Suggested

```
#82AAFF
```

---

## 10. Methods (Cyan)

When accessed through a receiver.

```mantiq
diag.with_code()
list.append()
option.unwrap()
```

Suggested

```
#89DDFF
```

---

## 11. Variables (White)

```text
diag
color
row
col
hint
note
tag_name
idx
line_num
```

Suggested

```
#EEFFFF
```

---

## 12. Constants (Orange/Yellow)

```text
PI
MAX_SIZE
VERSION
```

Also enum variants.

```text
Severity.Error
Severity.Warning
Severity.Help
```

Suggested

```
#FFCB6B
```

---

## 13. Namespace / Modules (Cyan)

```mantiq
std.collections
std.string
symbols
```

Suggested

```
#89DDFF
```

---

## 14. Operators (White)

```text
+
-
*
/
%
=
==
!=
<
<=
>
>=
&&
||
!
&
|
^
<<
>>
```

Suggested

```
#89DDFF
```

---

## 15. Punctuation (Gray)

```text
(
)
[
]
{
}
,
.
:
;
```

Suggested

```
#A6ACCD
```

---

## 16. Generic Parameters (Yellow)

```mantiq
Option[String]
List[Diagnostic]
ptr[u8]
```

Everything inside `[]` that is a type remains yellow.

---

## 17. Attributes / Visibility (Purple)

```text
public
private
internal
unsafe
```

Suggested

```
#C792EA
```

---

## 18. Enum Variants (Orange)

```mantiq
Severity.Error
Severity.Warning
LabelKind.Primary
```

Only the variant name gets this color.

Suggested

```
#F78C6C
```

---

# Complete Token Groups

| Category      | Examples                              | Color      |
| ------------- | ------------------------------------- | ---------- |
| Keywords      | `fn`, `let`, `return`, `if`, `struct` | Purple     |
| Types         | `u32`, `String`, `List`               | Yellow     |
| Functions     | `printf`, `make`, `render`            | Blue       |
| Methods       | `.append()`, `.unwrap()`              | Cyan       |
| Variables     | `diag`, `idx`, `count`                | White      |
| Strings       | `"Hello"`                             | Green      |
| Numbers       | `42`, `3.14`                          | Orange     |
| Booleans      | `true`, `false`, `None`               | Orange     |
| Enum Variants | `Error`, `Primary`                    | Orange     |
| Modules       | `std`, `symbols`                      | Cyan       |
| Comments      | `// comment`                          | Gray       |
| Operators     | `+`, `==`, `=`                        | Light Cyan |
| Punctuation   | `()[]{},.;`                           | Gray       |
| Visibility    | `public`, `private`                   | Purple     |

Looking at your language, I'd recommend following a style close to Rust Analyzer or JetBrains rather than coloring every keyword differently. Mantiq already has a fairly rich syntax with constructs like `as`, `to`, `ptr`, generics, and ownership semantics, so using around 12 to 15 semantic color groups will keep code readable and consistent. The sample you shared clearly uses these constructs throughout, making semantic grouping a better fit than purely lexical highlighting. 
