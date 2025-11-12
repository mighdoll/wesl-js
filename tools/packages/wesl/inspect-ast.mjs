import { parseSrcModule, weslParserConfig } from './src/ParseWESL.ts';
import { astToString } from './src/debug/ASTtoString.ts';

weslParserConfig.useV2Parser = false;

const examples = [
  { name: 'const', src: 'const x = 1;' },
  { name: 'var', src: 'var x: i32;' },
  { name: 'alias', src: 'alias MyType = vec4<f32>;' },
  { name: 'struct', src: 'struct Foo { x: i32 }' },
];

for (const ex of examples) {
  const srcModule = { src: ex.src, modulePath: ['test'], moduleName: 'test' };
  const ast = parseSrcModule(srcModule);
  console.log('\n=== ' + ex.name.toUpperCase() + ' ===');
  console.log(astToString(ast.moduleElem));
}
