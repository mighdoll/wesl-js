import { enableTracing } from "mini-parse";
import { weslParserConfig } from "../ParseWESL.ts";

// enable parser tracing features
enableTracing();

// Use V1 parser explicitly
weslParserConfig.useV2Parser = false;
console.log("[TestSetupV1] Using V1 parser");
