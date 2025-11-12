import { parseWESL } from './src/ParseWESL.ts';
import { weslParserConfig } from './src/WeslParserConfig.ts';

// Enable V2 parser
weslParserConfig.useV2Parser = true;

const src = `
fn foo(x: i32, y: u32) -> f32 {
  return 1.0;
}`;

const result = parseWESL(src, "test.wesl");

// Find the fn element
const fn = result.rootElems.find(e => e.kind === 'fn');
if (fn) {
  console.log('Function element:');
  console.log(`  start: ${fn.start}, end: ${fn.end}`);
  console.log(`  contents: ${fn.contents.length}`);
  
  fn.contents.forEach((c, i) => {
    console.log(`  [${i}] kind: ${c.kind}, start: ${c.start}, end: ${c.end}`);
    if (c.kind === 'text') {
      const text = src.substring(c.start, c.end);
      console.log(`      text: '${text}'`);
    } else if (c.kind === 'param') {
      console.log(`      param contents: ${c.contents.length}`);
      c.contents.forEach((pc, j) => {
        console.log(`        [${j}] kind: ${pc.kind}, start: ${pc.start}, end: ${pc.end}`);
        if (pc.kind === 'text') {
          const text = src.substring(pc.start, pc.end);
          console.log(`            text: '${text}'`);
        }
      });
    } else if (c.kind === 'type') {
      console.log(`      return type contents: ${c.contents.length}`);
    } else if (c.kind === 'statement') {
      console.log(`      statement contents: ${c.contents.length}`);
      c.contents.forEach((sc, k) => {
        console.log(`        [${k}] kind: ${sc.kind}, start: ${sc.start}, end: ${sc.end}`);
        if (sc.kind === 'text') {
          const text = src.substring(sc.start, sc.end);
          console.log(`            text: '${text}'`);
        }
      });
    }
  });
}

console.log('\nSource positions:');
for (let i = 0; i < Math.min(src.length, 80); i++) {
  const ch = src[i];
  const display = ch === '\n' ? '\\n' : ch === ' ' ? '·' : ch;
  if (i % 20 === 0) console.log();
  process.stdout.write(`${i}:${display} `);
}
console.log();
