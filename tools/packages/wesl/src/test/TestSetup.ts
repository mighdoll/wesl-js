import { enableTracing } from "mini-parse";
import { weslParserConfig } from "../ParseWESL.ts";

// enable parser tracing features
enableTracing();

// Use V1 parser (default)
weslParserConfig.useV2Parser = false;
console.log("[TestSetup] Using V1 parser");
