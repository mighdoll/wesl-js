import { ExternalTokenizer } from "@lezer/lr";
import { templateArgsEndFallback } from "./parser.terms.js";

const GreaterThan = 62; // '>'

// Fallback tokenizer to handle nested template closing brackets.
// When the standard tokenizer sees '>>', it returns a shift operator.
// This tokenizer recognizes '>' followed by '>' and emits a single '>'
// as templateArgsEndFallback, allowing nested templates like array<vec4<f32>>.
export const fallback = new ExternalTokenizer(
  (input) => {
    // When we see '>>' and the parser could accept a template-closing '>',
    // emit just the first '>' as templateArgsEndFallback
    if (input.next === GreaterThan && input.peek(1) === GreaterThan) {
      input.acceptToken(templateArgsEndFallback, 1);
    }
  },
  { extend: true }
);
