import { parseSrcModule, weslParserConfig } from './src/ParseWESL.ts';
import { astToString } from './src/debug/ASTtoString.ts';

// Test function with call in body
const src = `fn foo() { bar(); }`;
const srcModule = { src, modulePath: ['test'], moduleName: 'test' };

console.log('=== V1 Parser ===');
weslParserConfig.useV2Parser = false;
const v1 = parseSrcModule(srcModule);
console.log(astToString(v1.moduleElem));

console.log('\n=== V2 Parser ===');
weslParserConfig.useV2Parser = true;
const v2 = parseSrcModule(srcModule);
console.log(astToString(v2.moduleElem));

// Detailed analysis
console.log('\n=== Analysis ===');

const v1Fn = v1.moduleElem.contents.find(e => e.kind === 'fn');
const v2Fn = v2.moduleElem.contents.find(e => e.kind === 'fn');

if (v1Fn && v1Fn.kind === 'fn') {
  console.log('--- V1 Function ---');
  console.log(`Contents count: ${v1Fn.contents?.length || 0}`);
  if (v1Fn.contents) {
    v1Fn.contents.forEach((c, i) => {
      console.log(`  [${i}] kind: ${c.kind}`);
      if (c.kind === 'statement') {
        console.log(`      statement contents: ${c.contents?.length || 0}`);
        if (c.contents) {
          c.contents.forEach((sc, si) => {
            console.log(`        [${si}] kind: ${sc.kind}`);
          });
        }
      }
    });
  }
}

if (v2Fn && v2Fn.kind === 'fn') {
  console.log('\n--- V2 Function ---');
  console.log(`Contents count: ${v2Fn.contents?.length || 0}`);
  if (v2Fn.contents) {
    v2Fn.contents.forEach((c, i) => {
      console.log(`  [${i}] kind: ${c.kind}`);
      if (c.kind === 'statement') {
        console.log(`      statement contents: ${c.contents?.length || 0}`);
        if (c.contents) {
          c.contents.forEach((sc, si) => {
            console.log(`        [${si}] kind: ${sc.kind}`);
          });
        }
      }
    });
  }
}
