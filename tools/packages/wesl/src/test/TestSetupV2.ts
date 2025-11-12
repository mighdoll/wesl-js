/**
 * Test setup for V2 parser
 * This file is loaded before tests run to configure the parser
 */

import { weslParserConfig } from "../ParseWESL.ts";

// Enable V2 parser
weslParserConfig.useV2Parser = true;

console.log("[TestSetup] Using V2 parser");
