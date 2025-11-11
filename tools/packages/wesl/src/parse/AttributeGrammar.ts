import { tagScope } from "mini-parse";
import { specialAttribute } from "../WESLCollect.ts";
import {
  elifAttributeParser,
  elseAttributeParser,
  ifAttributeParser,
} from "./AttributeAdapters.ts";

/** Base parser for @if attributes without collection - use in seq() compositions */
export const if_attribute_base = ifAttributeParser.ptag("attr_variant");

/** Base parser for @elif attributes without collection - use in seq() compositions */
export const elif_attribute_base = elifAttributeParser.ptag("attr_variant");

/** Base parser for @else attributes without collection - use in seq() compositions */
export const else_attribute_base = elseAttributeParser.ptag("attr_variant");

/** Collected parser for @if attributes - use standalone, not in seq() */
export const if_attribute = tagScope(
  if_attribute_base.collect(specialAttribute),
);

/** Collected parser for @elif attributes - use standalone, not in seq() */
export const elif_attribute = tagScope(
  elif_attribute_base.collect(specialAttribute),
);

/** Collected parser for @else attributes - use standalone, not in seq() */
export const else_attribute = tagScope(
  else_attribute_base.collect(specialAttribute),
);
