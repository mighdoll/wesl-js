import type {
  ExpressionElem,
  HasAttributes,
  StandardAttribute,
  UnknownExpressionElem,
} from "wesl";

/** Find a StandardAttribute by name on an element with attributes. */
export function findAnnotation(
  elem: HasAttributes,
  name: string,
): StandardAttribute | undefined {
  for (const a of elem.attributes ?? []) {
    const attr = a.attribute;
    if (attr.kind === "@attribute" && attr.name === name) return attr;
  }
}

/** Extract string params from an annotation's UnknownExpressionElem params. */
export function annotationParams(attr: StandardAttribute): string[] {
  return attr.params?.map(param => exprToString(param.expression)) ?? [];
}

/** Extract numeric params from an annotation. */
export function numericParams(attr: StandardAttribute): number[] {
  return annotationParams(attr).map(Number);
}

/** The originalName of an attribute parameter that is a bare identifier ref. */
export function firstRefName(
  param: UnknownExpressionElem | undefined,
): string | undefined {
  const expr = param?.expression;
  return expr?.kind === "ref" ? expr.ident.originalName : undefined;
}

/** Extract the string value of an attribute-parameter expression. */
function exprToString(expr: ExpressionElem): string {
  if (expr.kind === "literal") return expr.value;
  if (expr.kind === "ref") return expr.ident.originalName;
  return "";
}
