import { parseSrcModule, weslParserConfig } from './src/ParseWESL.ts';
import { astToString } from './src/debug/ASTtoString.ts';

weslParserConfig.useV2Parser = false;

const examples = [
  { name: 'simple fn', src: 'fn foo() { }' },
  { name: 'fn with param', src: 'fn foo(x: i32) { }' },
  { name: 'fn with return', src: 'fn foo() -> i32 { return 1; }' },
];

for (const ex of examples) {
  const srcModule = { src: ex.src, modulePath: ['test'], moduleName: 'test' };
  const ast = parseSrcModule(srcModule);
  console.log('\n=== ' + ex.name.toUpperCase() + ' ===');
  console.log(astToString(ast.moduleElem));
}
