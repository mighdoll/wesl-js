/**
 * Custom parsers for WESL global directives
 * Week 8: enable, requires, diagnostic directives
 */

import type {
  DiagnosticDirective,
  DirectiveElem,
  EnableDirective,
  NameElem,
  RequiresDirective,
} from "../AbstractElems.ts";
import { parseAttributeList } from "./AttributeParsers.ts";
import type { ParseContext } from "./ParseContext.ts";
import {
  attachAttributes,
  checkpoint,
  consume,
  expect,
  reset,
} from "./ParseUtil.ts";
import type { WeslStream } from "./WeslStream.ts";

/**
 * Parse a comma-separated list of names
 * Used by enable and requires directives
 */
function parseNameList(stream: WeslStream): NameElem[] {
  const names: NameElem[] = [];

  while (true) {
    const nameToken = stream.peek();
    if (!nameToken || nameToken.kind !== "word") {
      throw new Error("Expected identifier in name list");
    }

    stream.nextToken();

    const nameElem: NameElem = {
      kind: "name",
      name: nameToken.text,
      start: nameToken.span[0],
      end: nameToken.span[1],
    };

    names.push(nameElem);

    // Check for comma or end
    const next = stream.peek();
    if (!next || next.text !== ",") {
      break;
    }

    stream.nextToken(); // consume comma
  }

  return names;
}

/**
 * Parse enable directive
 *
 * Grammar: enable_directive : 'enable' enable_extension_list ';'
 * Grammar: enable_extension_list : enable_extension_name ( ',' enable_extension_name ) * ',' ?
 */
function parseEnableDirective(
  stream: WeslStream,
  _ctx: ParseContext,
  attributes?: AttributeElem[],
): DirectiveElem | null {
  const startPos = checkpoint(stream);

  // Expect "enable" keyword
  if (!consume(stream, "enable")) return null;

  // Parse comma-separated extension names
  const extensions = parseNameList(stream);

  // Expect semicolon
  expect(stream, ";", "Expected ';' after enable directive");

  const endPos = checkpoint(stream);

  const enableDir: EnableDirective = {
    kind: "enable",
    extensions,
  };

  const directiveElem: DirectiveElem = {
    kind: "directive",
    directive: enableDir,
    start: startPos,
    end: endPos,
  };

  attachAttributes(directiveElem, attributes);

  return directiveElem;
}

/**
 * Parse requires directive
 *
 * Grammar: requires_directive : 'requires' language_extension_list ';'
 * Grammar: language_extension_list : language_extension_name ( ',' language_extension_name ) * ',' ?
 */
function parseRequiresDirective(
  stream: WeslStream,
  _ctx: ParseContext,
  attributes?: AttributeElem[],
): DirectiveElem | null {
  const startPos = checkpoint(stream);

  // Expect "requires" keyword
  if (!consume(stream, "requires")) return null;

  // Parse comma-separated extension names
  const extensions = parseNameList(stream);

  // Expect semicolon
  expect(stream, ";", "Expected ';' after requires directive");

  const endPos = checkpoint(stream);

  const requiresDir: RequiresDirective = {
    kind: "requires",
    extensions,
  };

  const directiveElem: DirectiveElem = {
    kind: "directive",
    directive: requiresDir,
    start: startPos,
    end: endPos,
  };

  attachAttributes(directiveElem, attributes);

  return directiveElem;
}

/**
 * Parse diagnostic directive
 *
 * Grammar: diagnostic_directive : 'diagnostic' diagnostic_control ';'
 * Grammar: diagnostic_control : '(' severity_control_name ',' diagnostic_rule_name ',' ? ')'
 * Grammar: diagnostic_rule_name : diagnostic_name_token | diagnostic_name_token '.' diagnostic_name_token
 */
function parseDiagnosticDirective(
  stream: WeslStream,
  _ctx: ParseContext,
  attributes?: AttributeElem[],
): DirectiveElem | null {
  const startPos = checkpoint(stream);

  // Expect "diagnostic" keyword
  if (!consume(stream, "diagnostic")) return null;

  // Expect "("
  expect(stream, "(", "Expected '(' after diagnostic");

  // Parse severity (first name)
  const severityToken = stream.peek();
  if (!severityToken || severityToken.kind !== "word") {
    throw new Error("Expected severity in diagnostic directive");
  }

  stream.nextToken();

  const severity: NameElem = {
    kind: "name",
    name: severityToken.text,
    start: severityToken.span[0],
    end: severityToken.span[1],
  };

  // Expect comma
  expect(stream, ",", "Expected ',' after diagnostic severity");

  // Parse rule name (second name)
  const ruleToken = stream.peek();
  if (!ruleToken || ruleToken.kind !== "word") {
    throw new Error("Expected rule name in diagnostic directive");
  }

  stream.nextToken();

  const ruleName: NameElem = {
    kind: "name",
    name: ruleToken.text,
    start: ruleToken.span[0],
    end: ruleToken.span[1],
  };

  // Check for optional subrule: .subrule_name
  let subrule: NameElem | null = null;

  if (consume(stream, ".")) {
    const subruleToken = stream.peek();
    if (!subruleToken || subruleToken.kind !== "word") {
      throw new Error(
        "Expected subrule name after '.' in diagnostic directive",
      );
    }

    stream.nextToken();

    subrule = {
      kind: "name",
      name: subruleToken.text,
      start: subruleToken.span[0],
      end: subruleToken.span[1],
    };
  }

  // Optional trailing comma
  consume(stream, ",");

  // Expect ")"
  expect(stream, ")", "Expected ')' after diagnostic rule");

  // Expect semicolon
  expect(stream, ";", "Expected ';' after diagnostic directive");

  const endPos = checkpoint(stream);

  const diagnosticDir: DiagnosticDirective = {
    kind: "diagnostic",
    severity,
    rule: [ruleName, subrule],
  };

  const directiveElem: DirectiveElem = {
    kind: "directive",
    directive: diagnosticDir,
    start: startPos,
    end: endPos,
  };

  attachAttributes(directiveElem, attributes);

  return directiveElem;
}

/**
 * Parse a global directive (enable, requires, or diagnostic)
 * Can be preceded by attributes
 */
export function parseDirective(
  stream: WeslStream,
  ctx: ParseContext,
): DirectiveElem | null {
  const startPos = checkpoint(stream);

  // Parse optional attributes
  const attributes = parseAttributeList(stream);

  // Try each directive type
  const enableDir = parseEnableDirective(
    stream,
    ctx,
    attributes.length > 0 ? attributes : undefined,
  );
  if (enableDir) return enableDir;

  const requiresDir = parseRequiresDirective(
    stream,
    ctx,
    attributes.length > 0 ? attributes : undefined,
  );
  if (requiresDir) return requiresDir;

  const diagnosticDir = parseDiagnosticDirective(
    stream,
    ctx,
    attributes.length > 0 ? attributes : undefined,
  );
  if (diagnosticDir) return diagnosticDir;

  // No directive found
  reset(stream, startPos);
  return null;
}
