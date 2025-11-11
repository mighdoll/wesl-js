/**
 * Adapters that wrap direct parsers into mini-parse Parser instances.
 */

import { createAdapter } from "./AdapterUtil.ts";
import {
  parseAttributeIfExpression,
  parseAttributeIfPrimaryExpression,
  parseAttributeIfUnaryExpression,
  parseElifAttribute,
  parseElseAttribute,
  parseIfAttribute,
  parseLiteral,
  parseTranslateTimeFeature,
} from "./AttributeParsers.ts";

// Export adapted parsers
export const literalParser = createAdapter(parseLiteral, "literal");

export const translateTimeFeatureParser = createAdapter(
  parseTranslateTimeFeature,
  "translate_time_feature",
);

export const elseAttributeParser = createAdapter(
  parseElseAttribute,
  "else_attribute",
);

export const attributeIfPrimaryExpressionParser = createAdapter(
  parseAttributeIfPrimaryExpression,
  "attribute_if_primary_expression",
);

export const attributeIfUnaryExpressionParser = createAdapter(
  parseAttributeIfUnaryExpression,
  "attribute_if_unary_expression",
);

export const attributeIfExpressionParser = createAdapter(
  parseAttributeIfExpression,
  "attribute_if_expression",
);

export const ifAttributeParser = createAdapter(
  parseIfAttribute,
  "if_attribute",
);

export const elifAttributeParser = createAdapter(
  parseElifAttribute,
  "elif_attribute",
);
