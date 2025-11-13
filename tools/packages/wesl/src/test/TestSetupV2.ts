import { enableTracing } from "mini-parse";
import { weslParserConfig } from "../ParseWESL.ts";

// enable parser tracing features
enableTracing();

// Use V2 parser explicitly
weslParserConfig.useV2Parser = true;
console.log("[TestSetupV2] Using V2 parser");
