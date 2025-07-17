Let's consider what convenience functions to have for parsing token streams:

Some ideas to get you started:

```typescript
function consumeText(stream:Stream, text: string, message: string): void {
  const pos = stream.checkpoint();
  if(!match(stream, text)) {
    console.error(message);
    throw new ParseError(msg, [before, ctx.stream.checkpoint()]);
  }
}

function match(stream: Stream, text: string): boolean {
  const pos = stream.checkpoint();
  const token = (stream as WeslStream).nextToken();
  if (token?.text === expected) return true;
  else {
    stream.reset(pos);
    return false;
  }
}

function matchToken(stream:Stream, tokenType:WeslToken): boolean {
  const pos = stream.checkpoint();
  const token = (stream as WeslStream).nextToken();
  if (token?.text === expected) return true;
  else {
    stream.reset(pos);
    return false;
  }
}
```