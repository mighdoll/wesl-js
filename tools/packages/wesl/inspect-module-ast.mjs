import { astToString } from "./src/debug/ASTtoString.ts";
import { parseSrcModule, weslParserConfig } from "./src/ParseWESL.ts";

weslParserConfig.useV2Parser = false;

const examples = [
  { name: "import", src: "import foo::bar;" },
  { name: "enable", src: "enable f16;" },
  { name: "diagnostic", src: "diagnostic(off, derivative_uniformity);" },
];

for (const ex of examples) {
  const srcModule = { src: ex.src, modulePath: ["test"], moduleName: "test" };
  const ast = parseSrcModule(srcModule);
  console.log("\n=== " + ex.name.toUpperCase() + " ===");
  console.log(astToString(ast.moduleElem));
}
