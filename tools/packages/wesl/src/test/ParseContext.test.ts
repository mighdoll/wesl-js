import { expect, test } from "vitest";
import type { WeslParseState } from "../ParseWESL.ts";
import { createParseContext } from "../parse/v2/ParseContext.ts";
import { WeslStream } from "../parse/WeslStream.ts";
import { emptyScope, resetScopeIds } from "../Scope.ts";

function createTestContext(): {
  ctx: ReturnType<typeof createParseContext>;
  state: WeslParseState;
} {
  resetScopeIds();
  const src = "fn test() {}";
  const stream = new WeslStream(src);
  const rootScope = emptyScope(null);

  const srcModule = {
    debugFilePath: "test.wesl",
    modulePath: "test",
    src,
  };

  const state: WeslParseState = {
    context: {
      scope: rootScope,
      openElems: [],
    },
    stable: {
      srcModule,
      moduleElem: {
        kind: "module",
        contents: [],
        start: 0,
        end: src.length,
      },
      rootScope,
      imports: [],
    },
  };

  const ctx = createParseContext(stream, state);
  return { ctx, state };
}

test("ParseContext: scope management", () => {
  const { ctx } = createTestContext();

  // Initial scope
  const rootScope = ctx.currentScope();
  expect(rootScope.id).toBe(0);
  expect(rootScope.parent).toBeNull();

  // Push new scope
  ctx.pushScope();
  const childScope = ctx.currentScope();
  expect(childScope.id).toBe(1);
  expect(childScope.parent).toBe(rootScope);

  // Pop scope
  const popped = ctx.popScope();
  expect(popped).toBe(childScope);
  expect(ctx.currentScope()).toBe(rootScope);
});

test("ParseContext: nested scopes", () => {
  const { ctx } = createTestContext();

  ctx.pushScope(); // depth 1
  const scope1 = ctx.currentScope();

  ctx.pushScope(); // depth 2
  const scope2 = ctx.currentScope();

  ctx.pushScope(); // depth 3
  const scope3 = ctx.currentScope();

  expect(scope3.parent).toBe(scope2);
  expect(scope2.parent).toBe(scope1);

  ctx.popScope(); // back to depth 2
  expect(ctx.currentScope()).toBe(scope2);

  ctx.popScope(); // back to depth 1
  expect(ctx.currentScope()).toBe(scope1);
});

test("ParseContext: createRefIdent", () => {
  const { ctx } = createTestContext();

  const ident = ctx.createRefIdent("myVar", [0, 5]);

  expect(ident.kind).toBe("ref");
  expect(ident.originalName).toBe("myVar");
  expect(ident.id).toBeGreaterThanOrEqual(0);
  expect(ident.ast).toBeDefined();
});

test("ParseContext: createDeclIdent", () => {
  const { ctx } = createTestContext();

  const ident = ctx.createDeclIdent("myFn", [0, 4], false);

  expect(ident.kind).toBe("decl");
  expect(ident.originalName).toBe("myFn");
  expect(ident.isGlobal).toBe(false);
  expect(ident.containingScope).toBeDefined();
  expect(ident.id).toBeGreaterThanOrEqual(0);
});

test("ParseContext: createDeclIdent global", () => {
  const { ctx } = createTestContext();

  const ident = ctx.createDeclIdent("myGlobal", [0, 8], true);

  expect(ident.isGlobal).toBe(true);
});

test("ParseContext: saveIdent adds to scope", () => {
  const { ctx } = createTestContext();

  const rootScope = ctx.currentScope();
  const initialContents = rootScope.contents.length;

  const ident = ctx.createRefIdent("x", [0, 1]);
  ctx.saveIdent(ident);

  expect(rootScope.contents.length).toBe(initialContents + 1);
  expect(rootScope.contents[initialContents]).toBe(ident);
});

test("ParseContext: position returns stream position", () => {
  const { ctx } = createTestContext();

  const pos1 = ctx.position();
  expect(pos1).toBe(0);

  // Advance stream
  ctx.stream.nextToken();
  const pos2 = ctx.position();
  expect(pos2).toBeGreaterThan(pos1);
});

test("ParseContext: addElem with open container", () => {
  const { ctx, state } = createTestContext();

  // Create a container element
  const containerElem = {
    kind: "module" as const,
    contents: [],
    srcModule: state.stable.srcModule,
  };

  // Add container to openElems
  state.context.openElems.push(containerElem);

  // Create and add an element
  const elem = {
    kind: "ref" as const,
    start: 0,
    end: 1,
    srcModule: state.stable.srcModule,
    ident: ctx.createRefIdent("test", [0, 4]),
  };

  ctx.addElem(elem);

  expect(containerElem.contents.length).toBe(1);
  expect(containerElem.contents[0]).toBe(elem);
});

test("ParseContext: addElem without open container", () => {
  const { ctx, state } = createTestContext();

  // No open elements
  expect(state.context.openElems.length).toBe(0);

  const elem = {
    kind: "ref" as const,
    start: 0,
    end: 1,
    srcModule: state.stable.srcModule,
    ident: ctx.createRefIdent("test", [0, 4]),
  };

  // Should not throw, just does nothing
  expect(() => ctx.addElem(elem)).not.toThrow();
});
