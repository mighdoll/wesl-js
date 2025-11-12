import { enableTracing } from "mini-parse";
import { weslParserConfig } from "../ParseWESL.ts";

// enable parser tracing features
enableTracing();

// Use V2 parser
weslParserConfig.useV2Parser = true;
console.log("[TestSetup] Using V2 parser");
