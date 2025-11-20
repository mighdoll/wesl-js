# WGSL Grammar Audit - V2 Parser

This document maps WGSL grammar productions (from the official spec) to our V2 parser functions.
Use this for ongoing maintenance and to identify coverage gaps.

## Grammar Reference

Official WGSL grammar: https://www.w3.org/TR/WGSL/#grammar-recursive-descent
Local copy: `/Users/lee/wesl/wgsl-syntax.bnf`

## Module Structure

### translation_unit
```
translation_unit :
  global_directive * ( global_decl | global_assert | ';' ) *
```
**Parser**: `WeslParserV2.parseModule()` in WeslParserV2.ts
- Parses imports (WESL extension), directives, then declarations
- ✅ Handles global_directive, global_decl, global_assert
- ✅ Handles standalone ';' after structs (gpuweb/gpuweb#2492)

### global_directive
```
global_directive :
  diagnostic_directive
| enable_directive
| requires_directive
```
**Parser**: `parseDirective()` in DirectiveParsers.ts
- ✅ All three directive types supported

### global_decl
```
global_decl :
  global_variable_decl ';'
| global_value_decl ';'
| type_alias_decl ';'
| struct_decl
| function_decl
```
**Parser**: `WeslParserV2.parseDeclarations()` in WeslParserV2.ts
- Uses array of parsers: parseConstDecl, parseOverrideDecl, parseVarDecl, parseAliasDecl, parseStructDecl, parseFnDecl

### global_assert
```
global_assert :
  const_assert ';'
```
**Parser**: `parseConstAssert()` in ConstParsers.ts

---

## Directives

### enable_directive
```
enable_directive :
  'enable' enable_extension_list ';'

enable_extension_list :
  enable_extension_name ( ',' enable_extension_name ) * ',' ?
```
**Parser**: `parseEnableDirective()` in DirectiveParsers.ts
- ✅ Full support

### requires_directive
```
requires_directive :
  'requires' language_extension_list ';'

language_extension_list :
  language_extension_name ( ',' language_extension_name ) * ',' ?
```
**Parser**: `parseRequiresDirective()` in DirectiveParsers.ts
- ✅ Full support

### diagnostic_directive
```
diagnostic_directive :
  'diagnostic' diagnostic_control ';'

diagnostic_control :
  '(' severity_control_name ',' diagnostic_rule_name ',' ? ')'

diagnostic_rule_name :
  diagnostic_name_token
| diagnostic_name_token '.' diagnostic_name_token
```
**Parser**: `parseDiagnosticDirective()` in DirectiveParsers.ts
- ✅ Full support including optional subrule

---

## Declarations

### global_variable_decl
```
global_variable_decl :
  attribute * variable_decl ( '=' expression ) ?

variable_decl :
  'var' _disambiguate_template template_list ? optionally_typed_ident
```
**Parser**: `parseVarDecl()` in ConstParsers.ts
- ✅ Attributes, var keyword, name, type, initializer
- ⚠️ Template list parsing is simplified (bracket-matching, not full template_list grammar)

### global_value_decl
```
global_value_decl :
  'const' optionally_typed_ident '=' expression
| attribute * 'override' optionally_typed_ident ( '=' expression ) ?
```
**Parser**:
- `parseConstDecl()` in ConstParsers.ts - global const
- `parseOverrideDecl()` in ConstParsers.ts - override with optional init
- ✅ Full support

### type_alias_decl
```
type_alias_decl :
  'alias' ident '=' type_specifier
```
**Parser**: `parseAliasDecl()` in ConstParsers.ts
- ✅ Full support

### struct_decl
```
struct_decl :
  'struct' ident struct_body_decl

struct_body_decl :
  '{' struct_member ( ',' struct_member ) * ',' ? '}'

struct_member :
  attribute * member_ident ':' type_specifier
```
**Parser**: `parseStructDecl()`, `parseStructMember()` in ConstParsers.ts
- ✅ Full support including member attributes

### function_decl
```
function_decl :
  attribute * function_header compound_statement

function_header :
  'fn' ident '(' param_list ? ')' ( '->' attribute * template_elaborated_ident ) ?

param_list :
  param ( ',' param ) * ',' ?

param :
  attribute * ident ':' type_specifier
```
**Parser**: `parseFnDecl()`, `parseFnParam()` in FnParsers.ts
- ✅ Full support including parameter and return type attributes

### optionally_typed_ident
```
optionally_typed_ident :
  ident ( ':' type_specifier ) ?
```
**Parser**: `parseTypedDecl()` in ConstParsers.ts
- ✅ Full support

---

## Statements

### statement
```
statement :
  ';'
| return_statement ';'
| if_statement
| switch_statement
| loop_statement
| for_statement
| while_statement
| func_call_statement ';'
| variable_or_value_statement ';'
| break_statement ';'
| continue_statement ';'
| 'discard' ';'
| variable_updating_statement ';'
| compound_statement
| assert_statement ';'
```
**Parser**: `parseStatement()` in StatementParsers.ts
- ✅ All statement types supported

### compound_statement
```
compound_statement :
  attribute * '{' statement * '}'
```
**Parser**: `parseCompoundStatement()` in StatementParsers.ts
- ✅ Full support with scope management

### if_statement
```
if_statement :
  attribute * if_clause else_if_clause * else_clause ?

if_clause :
  'if' expression compound_statement

else_if_clause :
  'else' 'if' expression compound_statement

else_clause :
  'else' compound_statement
```
**Parser**: `parseIfStatement()` in StatementParsers.ts
- ✅ Full support

### switch_statement
```
switch_statement :
  attribute * 'switch' expression switch_body

switch_body :
  attribute * '{' switch_clause + '}'

switch_clause :
  case_clause
| default_alone_clause

case_clause :
  'case' case_selectors ':' ? compound_statement

case_selectors :
  case_selector ( ',' case_selector ) * ',' ?

case_selector :
  'default'
| expression
```
**Parser**: `parseSwitchStatement()` in StatementParsers.ts
- ✅ Full support including multiple case values and optional colon

### loop_statement
```
loop_statement :
  attribute * 'loop' attribute * '{' statement * continuing_statement ? '}'

continuing_statement :
  'continuing' continuing_compound_statement

continuing_compound_statement :
  attribute * '{' statement * break_if_statement ? '}'

break_if_statement :
  'break' 'if' expression ';'
```
**Parser**: `parseLoopStatement()`, `parseContinuingStatement()` in StatementParsers.ts
- ✅ Full support including break_if inside continuing blocks

### for_statement
```
for_statement :
  attribute * 'for' '(' for_header ')' compound_statement

for_header :
  for_init ? ';' expression ? ';' for_update ?

for_init :
  variable_or_value_statement
| variable_updating_statement
| func_call_statement

for_update :
  variable_updating_statement
| func_call_statement
```
**Parser**: `parseForStatement()` in StatementParsers.ts
- ✅ Full support

### while_statement
```
while_statement :
  attribute * 'while' expression compound_statement
```
**Parser**: `parseWhileStatement()` in StatementParsers.ts
- ✅ Full support

### variable_or_value_statement (local)
```
variable_or_value_statement :
  variable_decl
| variable_decl '=' expression
| 'let' optionally_typed_ident '=' expression
| 'const' optionally_typed_ident '=' expression
```
**Parser**:
- `parseLocalVarDecl()` in ConstParsers.ts
- `parseLetDecl()` in ConstParsers.ts
- `parseConstDecl()` in ConstParsers.ts (handles both global and local)
- ✅ Full support

### variable_updating_statement
```
variable_updating_statement :
  assignment_statement
| increment_statement
| decrement_statement

assignment_statement :
  lhs_expression ( '=' | compound_assignment_operator ) expression
| '_' '=' expression

increment_statement :
  lhs_expression '++'

decrement_statement :
  lhs_expression '--'

compound_assignment_operator :
  '+=' | '-=' | '*=' | '/=' | '%=' | '&=' | '|=' | '^=' | _shift_right_assign | _shift_left_assign
```
**Parser**: `parseSimpleStatement()` in StatementParsers.ts
- ✅ Assignment, increment/decrement, compound assignment
- ✅ Underscore discard assignment

### return_statement
```
return_statement :
  'return' expression ?
```
**Parser**: `parseSimpleStatement()` (return case) in StatementParsers.ts
- ✅ Full support

### const_assert (statement)
```
const_assert :
  'const_assert' expression
```
**Parser**: `parseConstAssert()` in ConstParsers.ts
- ✅ Full support

---

## Expressions

### expression
```
expression :
  relational_expression
| short_circuit_or_expression '||' relational_expression
| short_circuit_and_expression '&&' relational_expression
| bitwise_expression
```
**Parser**: `parseExpression()` in ExpressionParsers.ts
- Uses precedence climbing for binary operators
- ✅ Full support

### unary_expression
```
unary_expression :
  singular_expression
| '-' unary_expression
| '!' unary_expression
| '~' unary_expression
| '*' unary_expression
| '&' unary_expression
```
**Parser**: `parseUnaryExpression()` in ExpressionParsers.ts
- ✅ All unary operators supported

### singular_expression
```
singular_expression :
  primary_expression component_or_swizzle_specifier ?
```
**Parser**: `parsePrimaryExpression()` then `parsePostfixExpression()` in ExpressionParsers.ts
- ✅ Full support

### primary_expression
```
primary_expression :
  template_elaborated_ident
| call_expression
| literal
| paren_expression
```
**Parser**: `parsePrimaryExpression()` in ExpressionParsers.ts
- ✅ Identifiers (including qualified names with ::)
- ✅ Function calls (handled in postfix)
- ✅ Literals (int, float, bool)
- ✅ Parenthesized expressions

### call_expression / call_phrase
```
call_expression :
  call_phrase

call_phrase :
  template_elaborated_ident argument_expression_list

argument_expression_list :
  '(' expression_comma_list ? ')'

expression_comma_list :
  expression ( ',' expression ) * ',' ?
```
**Parser**: `parsePostfixExpression()`, `parseFunctionCallArgs()` in ExpressionParsers.ts
- ✅ Full support including trailing commas
- ✅ Type constructors with template parameters: identifier<template>(args)

### component_or_swizzle_specifier
```
component_or_swizzle_specifier :
  '[' expression ']' component_or_swizzle_specifier ?
| '.' member_ident component_or_swizzle_specifier ?
| '.' swizzle_name component_or_swizzle_specifier ?
```
**Parser**: `parsePostfixExpression()` in ExpressionParsers.ts
- ✅ Array indexing [expr]
- ✅ Member access .member
- ⚠️ Swizzle (e.g., .xyz) parsed as member access (semantically equivalent for AST)

### lhs_expression
```
lhs_expression :
  core_lhs_expression component_or_swizzle_specifier ?
| '*' lhs_expression
| '&' lhs_expression

core_lhs_expression :
  ident _disambiguate_template
| '(' lhs_expression ')'
```
**Parser**: Uses regular `parseExpression()` for LHS
- ⚠️ V2 doesn't distinguish lhs_expression from expression at parse time
- This is semantically validated later, not during parsing

### Binary Expression Operators

**Multiplicative**: `* / %` (precedence 10)
**Additive**: `+ -` (precedence 9)
**Shift**: `<< >>` (precedence 8)
**Relational**: `< > <= >= == !=` (precedence 6-7)
**Bitwise**: `& | ^` (precedence 3-5)
**Logical**: `&& ||` (precedence 1-2)

**Parser**: `parseBinaryExpression()` with `BINARY_PRECEDENCE` table in ExpressionParsers.ts
- ✅ All operators with correct precedence

---

## Types

### type_specifier
```
type_specifier :
  template_elaborated_ident
```
**Parser**: `parseSimpleTypeRef()` in TypeParsers.ts
- ✅ Full support

### template_elaborated_ident
```
template_elaborated_ident :
  ident _disambiguate_template template_list ?
```
**Parser**: `parseSimpleTypeRef()` in TypeParsers.ts
- ✅ Qualified names (pkg::Type)
- ✅ Template parameters

### template_list
```
template_list :
  _template_args_start template_arg_comma_list _template_args_end

template_arg_comma_list :
  template_arg_expression ( ',' template_arg_expression ) * ',' ?

template_arg_expression :
  expression
```
**Parser**: `parseSimpleTypeRef()` with `parseStubTemplateExpression()` in TypeParsers.ts
- ✅ Nested type templates (e.g., array<vec4<f32>>)
- ⚠️ Expression arguments use stub parser (simple bracket matching)

---

## Attributes

### attribute
```
attribute :
  '@' ident_pattern_token argument_expression_list ?
| align_attr
| binding_attr
| blend_src_attr
| builtin_attr
| const_attr
| diagnostic_attr
| group_attr
| id_attr
| interpolate_attr
| invariant_attr
| location_attr
| must_use_attr
| size_attr
| workgroup_size_attr
| vertex_attr
| fragment_attr
| compute_attr
```
**Parser**: `parseAttribute()`, `parseAttributeList()` in AttributeParsers.ts
- ✅ Standard attributes with parameters
- ✅ @builtin with specific handling
- ✅ @interpolate with specific handling
- ✅ @diagnostic with specific handling
- ✅ WESL extensions: @if, @elif, @else

---

## Literals

### literal
```
literal :
  int_literal
| float_literal
| bool_literal
```
**Parser**: `parseSimpleLiteral()` in ExpressionParsers.ts
- ✅ Boolean literals (true, false)
- ✅ Numeric literals (delegated to lexer)

### Numeric Formats
- Decimal int: `0u`, `123i`, etc.
- Hex int: `0x1f`, `0XABC`, etc.
- Decimal float: `1.0`, `.5e10`, `1e-3f`, etc.
- Hex float: `0x1.8p1`, etc.

**Lexer**: Handled by `WeslStream` tokenizer
- ✅ All numeric formats supported

---

## Coverage Summary

### Fully Supported ✅
- All declaration types (const, var, override, alias, struct, fn)
- All statement types (if, switch, loop, for, while, return, break, continue, discard)
- All expression operators (unary, binary, precedence)
- All directives (enable, requires, diagnostic)
- Standard WGSL attributes
- Type templates and qualified names

### Simplified/Stub Implementations ⚠️
- **var template list**: Simple bracket matching, not full grammar
- **Template expression arguments**: Stub parser (works for most cases)
- **lhs_expression**: Uses regular expression parser (validated semantically)
- **Swizzle names**: Parsed as member access (semantically correct)

### WESL Extensions (Not in WGSL Spec)
- Import statements with :: syntax
- @if/@elif/@else conditional compilation
- Qualified names with :: (e.g., pkg::Type)

---

## Maintenance Notes

### Adding New Productions

1. Find the grammar production in wgsl-syntax.bnf
2. Add the production as a comment above the parser function
3. Document any deviations or simplifications
4. Update this audit document

### Testing Against Spec

1. Run existing tests: `bb test:v2`
2. Check against CTS when available
3. Validate with real-world shaders (lygia, bevy)

### Precedence Updates

If WGSL spec changes operator precedence:
1. Update `BINARY_PRECEDENCE` table in ExpressionParsers.ts
2. Update tests to match new behavior
3. Note the spec change in this document

---

## Version History

- **2025-11-20**: Initial audit document created
  - Mapped all major grammar productions
  - Identified coverage gaps and simplifications
  - Documented WESL extensions
