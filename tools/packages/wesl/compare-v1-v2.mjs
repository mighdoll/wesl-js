import { parseSrcModule, weslParserConfig } from './src/ParseWESL.ts';
import { astToString } from './src/debug/ASTtoString.ts';

const examples = [
  { name: 'const', src: 'const x = 1;' },
  { name: 'var', src: 'var x: i32;' },
];

for (const ex of examples) {
  console.log('\n========================================');
  console.log('=== ' + ex.name.toUpperCase() + ' ===');
  console.log('========================================');

  const srcModule = { src: ex.src, modulePath: ['test'], moduleName: 'test' };

  weslParserConfig.useV2Parser = false;
  const astV1 = parseSrcModule(srcModule);
  console.log('\n--- V1 ---');
  console.log(astToString(astV1.moduleElem));

  weslParserConfig.useV2Parser = true;
  const astV2 = parseSrcModule(srcModule);
  console.log('\n--- V2 ---');
  console.log(astToString(astV2.moduleElem));
}
