import { styleTags, tags as t } from "@lezer/highlight";

/**
 * Syntax highlighting for WESL
 */
export const weslHighlighting = styleTags({
  // Literals
  Number: t.number,
  Boolean: t.bool,

  // Comments
  LineComment: t.lineComment,
  BlockComment: t.blockComment,

  // Keywords
  Import: t.keyword,
  "import as": t.keyword,
  "fn return if else switch case default for while loop break continue continuing discard":
    t.controlKeyword,
  "var let const override": t.definitionKeyword,
  "struct alias": t.definitionKeyword,
  "diagnostic enable requires const_assert": t.keyword,

  // Identifiers and names
  Identifier: t.variableName,
  "Type/Identifier": t.typeName,
  "TypeOrExpr/Identifier": t.typeName,
  "FunctionDeclaration/Identifier": t.function(t.definition(t.variableName)),
  "StructDeclaration/Identifier": t.definition(t.typeName),
  "Param/Identifier": t.definition(t.variableName),
  "StructMember/Identifier": t.propertyName,
  "VarStatement/Identifier": t.definition(t.variableName),
  "GlobalVariableDeclaration/Identifier": t.definition(t.variableName),
  "GlobalValueDeclaration/Identifier": t.definition(t.variableName),

  // Attributes
  simpleAttrName: t.attributeName,
  "ComplexAttribute/Identifier": t.attributeName,

  // Operators
  "AssignOp": t.definitionOperator,
  "++ --": t.updateOperator,

  // Punctuation
  "( )": t.paren,
  "[ ]": t.squareBracket,
  "{ }": t.brace,
  ". , ; : -> ::": t.punctuation,
  "< >": t.angleBracket,
});
