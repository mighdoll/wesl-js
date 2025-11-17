import { astToString } from "./src/debug/ASTtoString.ts";
import { parseSrcModule, weslParserConfig } from "./src/ParseWESL.ts";

weslParserConfig.useV2Parser = false;

const src = `
const x = 1;
var y: i32;
fn foo() { }
`;

const srcModule = { src, modulePath: ["test"], moduleName: "test" };
const ast = parseSrcModule(srcModule);
console.log(astToString(ast.moduleElem));
