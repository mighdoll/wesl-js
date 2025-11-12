/**
 * Test setup for V1 parser
 * This file is loaded before tests run to configure the parser
 */

import { weslParserConfig } from "../ParseWESL.ts";

// Ensure V1 parser is used
weslParserConfig.useV2Parser = false;

console.log("[TestSetup] Using V1 parser");
