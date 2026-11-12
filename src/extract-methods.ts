import { ClassDeclaration, Project, PropertySignature, SourceFile, SyntaxKind, TypeNode } from 'ts-morph';

import { extractGroups } from './extract-groups';
import { PACKAGES } from './paths';

export interface MethodEntry {
  name: string;
  signature: string;
  player: 'video' | 'music';
  // The subsystem that declares the behaviour (`core/transport`), or the
  // library itself for a method the player class implements on its own.
  group: string;
  // `accessor` is the stateful-noun pair — `quality()` reads, `quality(level)`
  // writes — which a native port answers with two overloads and can half-port
  // without any name going missing. `property` is plain data, which a native
  // port answers with a val. The grader needs to know which is which.
  kind: 'accessor' | 'method' | 'property';
  // Every parameter count the method can be called with, optional parameters
  // expanded. A name alone does not identify a method: the web's
  // `selectAudioOutput()` opens a system picker and a native
  // `selectAudioOutput(id)` routes to a device, and only the arity says so.
  arities: number[];
}

interface PlayerSpec {
  tsconfig: string;
  file: string;
  cls: string;
  player: MethodEntry['player'];
}

const PLAYERS: PlayerSpec[] = [
  { tsconfig: `${PACKAGES.video}/tsconfig.json`, file: `${PACKAGES.video}/src/index.ts`, cls: 'NMVideoPlayer', player: 'video' },
  { tsconfig: `${PACKAGES.music}/tsconfig.json`, file: `${PACKAGES.music}/src/index.ts`, cls: 'NMMusicPlayer', player: 'music' },
];

// Public declared surface only: `_`-prefixed internals and `__`-prefixed
// phantom brands (`__eventMap__`) are not part of the contract.
function isPublic(name: string): boolean {
  return !name.startsWith('_');
}

// A stateful noun is a reader and a writer sharing one name: a call taking
// nothing and returning the value, and a call taking the value and returning
// nothing.
//
// Counting call signatures is not enough. `t(key)` / `t(PluginClass, key)` and
// `qualityLevels()` / `qualityLevels(opts)` are overloaded readers — two
// signatures, no writer — and grading them as pairs demands a native setter
// that should not exist. The writer's `void` return is what tells them apart.
function kindOf(typeNode: TypeNode | undefined): MethodEntry['kind'] {
  if (!typeNode) return 'property';

  const literal = typeNode.asKind(SyntaxKind.TypeLiteral);
  if (!literal) {
    // `() => T` is a method; `string` / `HTMLElement` is a plain data property.
    return typeNode.asKind(SyntaxKind.FunctionType) ? 'method' : 'property';
  }

  const signatures = literal.getMembers()
    .map(member => member.asKind(SyntaxKind.CallSignature))
    .filter(signature => signature !== undefined);

  const reader = signatures.some(signature => signature.getParameters().length === 0);
  const writer = signatures.some((signature) => {
    const returns = signature.getReturnTypeNode()?.getText() ?? '';
    return signature.getParameters().length > 0 && (returns === 'void' || returns === 'Promise<void>');
  });

  return reader && writer ? 'accessor' : 'method';
}

// Optional parameters expand: `volumeUp(step?: number)` is callable with none
// and with one, and a native port answering only the one-argument form has not
// ported the call site the web docs show.
function aritiesOf(required: number, total: number): number[] {
  const counts: number[] = [];
  for (let count = required; count <= total; count += 1) counts.push(count);
  return counts;
}

function signatureArities(typeNode: TypeNode | undefined): number[] {
  if (!typeNode) return [];

  const literal = typeNode.asKind(SyntaxKind.TypeLiteral);
  const signatures = literal
    ? literal.getMembers().map(member => member.asKind(SyntaxKind.CallSignature)).filter(signature => signature !== undefined)
    : [typeNode.asKind(SyntaxKind.FunctionType)].filter(signature => signature !== undefined);

  const counts = new Set<number>();

  for (const signature of signatures) {
    const parameters = signature.getParameters();
    const required = parameters.filter(parameter => !parameter.isOptional() && !parameter.isRestParameter()).length;
    for (const count of aritiesOf(required, parameters.length)) counts.add(count);
  }

  return [...counts].sort((a, b) => a - b);
}

// Signature text comes straight out of the source file, so a CRLF checkout
// bakes \r\n into the JSON and the contract stops matching one generated on
// Linux. The contract has to be byte-identical whoever runs the generator.
function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

// The class merges with an interface of its own name that extends core's
// ComposedPlayerMethods; that interface carries most of the surface.
function mergedMembers(source: SourceFile, cls: string): PropertySignature[] {
  const merged = source.getInterface(cls);
  if (!merged) return [];

  return merged.getExtends().flatMap((heritage) => {
    const symbol = heritage.getExpression().getSymbol();
    const target = symbol?.getAliasedSymbol() ?? symbol;
    return (target?.getDeclarations() ?? [])
      .map(declaration => declaration.asKind(SyntaxKind.InterfaceDeclaration))
      .filter(declaration => declaration !== undefined)
      .flatMap(declaration => declaration.getProperties());
  });
}

function readClass(spec: PlayerSpec, groups: Map<string, string>): MethodEntry[] {
  // Core resolves to its source, so the generator needs no build of core.
  const project: Project = new Project({
    tsConfigFilePath: spec.tsconfig,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      paths: {
        '@nomercy-entertainment/nomercy-player-core': [`${PACKAGES.core}/src/index.ts`],
        '@nomercy-entertainment/nomercy-player-core/*': [`${PACKAGES.core}/src/*`],
      },
    },
  });
  const source = project.addSourceFileAtPath(spec.file);
  const cls: ClassDeclaration = source.getClassOrThrow(spec.cls);

  const entries: MethodEntry[] = [];

  const own = `${spec.player}/player`;
  const declared = new Set<string>([...cls.getProperties(), ...cls.getMethods()].map(member => member.getName()));
  const inherited = mergedMembers(source, spec.cls).filter(member => !declared.has(member.getName()));

  for (const prop of [...cls.getProperties(), ...inherited]) {
    if (!isPublic(prop.getName())) continue;
    entries.push({
      name: prop.getName(),
      signature: normalizeNewlines(prop.getTypeNode()?.getText() ?? 'unknown'),
      player: spec.player,
      group: groups.get(prop.getName()) ?? own,
      kind: kindOf(prop.getTypeNode()),
      arities: signatureArities(prop.getTypeNode()),
    });
  }

  for (const method of cls.getMethods()) {
    if (!isPublic(method.getName())) continue;
    const params = method.getParameters().map(p => p.getText()).join(', ');
    const ret = method.getReturnTypeNode()?.getText() ?? 'void';
    entries.push({
      name: method.getName(),
      signature: normalizeNewlines(`(${params}) => ${ret}`),
      player: spec.player,
      group: groups.get(method.getName()) ?? own,
      kind: 'method',
      arities: aritiesOf(
        method.getParameters().filter(parameter => !parameter.isOptional() && !parameter.isRestParameter()).length,
        method.getParameters().length,
      ),
    });
  }

  return entries;
}

export function extractMethods(): MethodEntry[] {
  const groups = extractGroups();
  return PLAYERS.flatMap(spec => readClass(spec, groups));
}
