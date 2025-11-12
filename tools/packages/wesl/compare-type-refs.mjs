import { parseSrcModule, weslParserConfig } from './src/ParseWESL.ts';
import { astToString } from './src/debug/ASTtoString.ts';

// Focus on type references
const src = 'var x: i32 = 1;';
const srcModule = { src, modulePath: ['test'], moduleName: 'test' };

console.log('=== V1 Parser (Current) ===');
weslParserConfig.useV2Parser = false;
const v1 = parseSrcModule(srcModule);
console.log(astToString(v1.moduleElem));

console.log('\n=== V2 Parser (Custom) ===');
weslParserConfig.useV2Parser = true;
const v2 = parseSrcModule(srcModule);
console.log(astToString(v2.moduleElem));

// Show detailed comparison
console.log('\n=== Analysis ===');
const v1Contents = v1.moduleElem.contents;
const v2Contents = v2.moduleElem.contents;

console.log(`V1 module contents count: ${v1Contents.length}`);
console.log(`V2 module contents count: ${v2Contents.length}`);

if (v1Contents.length > 0 && v1Contents[0].kind === 'gvar') {
  const v1Gvar = v1Contents[0];
  console.log('\n--- V1 Global Var ---');
  console.log(`Kind: ${v1Gvar.kind}`);
  console.log(`Contents count: ${v1Gvar.contents?.length || 0}`);
  if (v1Gvar.contents) {
    console.log('Contents:');
    v1Gvar.contents.forEach((c, i) => {
      console.log(`  [${i}] kind: ${c.kind}`);
      if (c.kind === 'type') {
        console.log(`      type contents: ${c.contents?.length || 0}`);
        if (c.contents && c.contents.length > 0) {
          console.log(`      first child kind: ${c.contents[0].kind}`);
        }
      }
    });
  }
}

if (v2Contents.length > 0 && v2Contents[0].kind === 'gvar') {
  const v2Gvar = v2Contents[0];
  console.log('\n--- V2 Global Var ---');
  console.log(`Kind: ${v2Gvar.kind}`);
  console.log(`Contents count: ${v2Gvar.contents?.length || 0}`);
  if (v2Gvar.contents) {
    console.log('Contents:');
    v2Gvar.contents.forEach((c, i) => {
      console.log(`  [${i}] kind: ${c.kind}`);
      if (c.kind === 'type') {
        console.log(`      type contents: ${c.contents?.length || 0}`);
        if (c.contents && c.contents.length > 0) {
          console.log(`      first child kind: ${c.contents[0].kind}`);
        }
      }
    });
  }
}
