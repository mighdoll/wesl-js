import { parseWESL } from './src/ParseWESL.ts';
import { weslParserConfig } from './src/WeslParserConfig.ts';

// Enable V2 parser
weslParserConfig.useV2Parser = true;

const src = `var x: i32 = 1;`;

const result = parseWESL(src, "test.wesl");

// Find the gvar element
const gvar = result.rootElems.find(e => e.kind === 'gvar');
if (gvar) {
  console.log('GlobalVar element:');
  console.log(`  start: ${gvar.start}, end: ${gvar.end}`);
  console.log(`  contents: ${gvar.contents.length}`);
  
  gvar.contents.forEach((c, i) => {
    console.log(`  [${i}] kind: ${c.kind}, start: ${c.start}, end: ${c.end}`);
    if (c.kind === 'text') {
      const text = src.substring(c.start, c.end);
      console.log(`      text: '${text}'`);
    } else if (c.kind === 'typeDecl') {
      console.log(`      typeDecl contents: ${c.contents.length}`);
      c.contents.forEach((tc, j) => {
        console.log(`        [${j}] kind: ${tc.kind}, start: ${tc.start}, end: ${tc.end}`);
        if (tc.kind === 'text') {
          const text = src.substring(tc.start, tc.end);
          console.log(`            text: '${text}'`);
        }
      });
    }
  });
}

console.log('\nSource:', src);
console.log('Positions:', src.split('').map((c, i) => `${i}:${c}`).join(' '));
