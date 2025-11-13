import { weslParserConfig } from "../ParseWESL.ts";
import { parseSrcModule } from "../ParseWESL.ts";
import type { SrcModule } from "../Scope.ts";
import { scopeToString } from "../debug/ScopeToString.ts";
import { resetScopeIds } from "../Scope.ts";

const src = `
fn foo() {}
fn bar() {}
`;

const srcModule: SrcModule = {
  modulePath: "test",
  debugFilePath: "test.wesl",
  src,
};

// Parse with V1
resetScopeIds();
weslParserConfig.useV2Parser = false;
const astV1 = parseSrcModule(srcModule);

console.log("=== V1 Scope Tree ===");
console.log(scopeToString(astV1.rootScope));

// Parse with V2
resetScopeIds();
weslParserConfig.useV2Parser = true;
const astV2 = parseSrcModule(srcModule);

console.log("\n=== V2 Scope Tree ===");
console.log(scopeToString(astV2.rootScope));
