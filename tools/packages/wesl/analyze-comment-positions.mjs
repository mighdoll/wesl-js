import { parseSrcModule, weslParserConfig } from './src/ParseWESL.ts';
import { astToString } from './src/debug/ASTtoString.ts';

weslParserConfig.useV2Parser = false;

// Test various comment positions
const examples = [
  {
    name: 'Module-level comments',
    src: `
// File header
// Multi-line comment

// Before const
const x = 1;  // After const

// Between declarations

// Before function
fn foo() {
  // Inside body
  return x;  // After statement
}  // After closing brace
`
  },
  {
    name: 'Struct comments',
    src: `
// Before struct
struct Foo {
  // Before first member
  x: i32,  // After member
  // Between members
  y: i32,  // After last member
  // Before closing brace
}  // After struct
`
  },
  {
    name: 'Expression comments',
    src: `
const x = 1 + // Mid-expression
          2;  // End of line
`
  },
  {
    name: 'Block comments',
    src: `
/* Block before */
const x = /* inline block */ 1;
/* After semicolon */
`
  }
];

for (const ex of examples) {
  console.log('\n' + '='.repeat(60));
  console.log('=== ' + ex.name.toUpperCase() + ' ===');
  console.log('='.repeat(60));
  console.log('\nSource:');
  console.log(ex.src);

  try {
    const srcModule = { src: ex.src, modulePath: ['test'], moduleName: 'test' };
    const ast = parseSrcModule(srcModule);
    console.log('\nAST:');
    console.log(astToString(ast.moduleElem));
  } catch (e) {
    console.log('\nParse Error:', e.message);
  }
}
