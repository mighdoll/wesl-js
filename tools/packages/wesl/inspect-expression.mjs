import { parseSrcModule, weslParserConfig } from './src/ParseWESL.ts';
import { astToString } from './src/debug/ASTtoString.ts';

weslParserConfig.useV2Parser = false;

const src = 'const_assert x < y;';
const srcModule = { src, modulePath: ['test'], moduleName: 'test' };
const ast = parseSrcModule(srcModule);

console.log(astToString(ast.moduleElem));
