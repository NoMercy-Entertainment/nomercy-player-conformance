import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { resolveMembers } from './native-surface';
import { indexMembers } from './compare';
import { NativeClass, parseAbiDump } from './native-surface';
import { jvmDumps, NATIVE, REPO_ROOT, WAIVERS } from './paths';

// The player class was never the whole surface.
//
// Everything a viewer actually touches lives in a plugin — the chrome, the
// subtitle renderer, casting, the key handlers, the visualisers — and the
// contract graded none of it, so "270 of 270 methods" described the engine and
// said nothing about the twenty-eight plugins bolted to it.
//
// The generator already extracts every plugin declaration. This grades them the
// same way the player's are graded: by class, member by member, against the
// published ABI.

const PLUGIN_SURFACE: string = resolve(
  REPO_ROOT,
  'tools',
  'player-contract',
  'contract',
  'plugin-surface.json',
);

export interface PluginDeclaration {
  plugin: string;
  visibility?: 'public' | 'protected' | 'private';
  package: string;
  file: string;
  exported: boolean;
  name: string;
  kind: string;
  owner?: string;
}

export interface PluginResult {
  plugin: string;
  /** False for the `<package>/src` buckets, which are adapters and kit, not plugins. */
  isPlugin: boolean;
  /** Web classes this plugin declares, and whether a native class answers each. */
  classes: { name: string; ported: boolean }[];
  total: number;
  present: number;
  missing: string[];
  waived: string[];
  /** Option fields the web plugin declares, and whether the port has each. */
  options: { total: number; present: number; missing: string[] };
}

export function readPluginSurface(path: string = PLUGIN_SURFACE): PluginDeclaration[] {
  return JSON.parse(readFileSync(path, 'utf8')) as PluginDeclaration[];
}

// Web class name -> the native class that answers it.
//
// Only where the two genuinely differ. A native plugin usually carries the web
// name, and where it does not the reason is on the native side — the ASS
// renderer is not named for a JavaScript library, and video and music need
// distinct classes where the web has one per package. Left unmapped, every one
// of these reads as an unported plugin, which is the opposite of true.
const ALIASES: Record<string, string[]> = {
  OctopusPlugin: ['SubtitlePlugin'],
  CastSenderPlugin: ['VideoCastPlugin', 'MusicConnectPlugin', 'CastSender'],
  KeyHandlerPlugin: ['KeyHandlerPlugin', 'VideoKeyHandlerPlugin', 'MusicKeyHandlerPlugin'],
  TvKeyHandlerPlugin: ['TvKeyHandlerPlugin'],
  MediaSessionPlugin: ['MediaSessionPlugin', 'VideoMediaSessionPlugin', 'MusicMediaSessionPlugin'],
  // The Compose chrome plugin carries the name of what it composes, not the
  // web's DOM-flavoured "desktop UI" — VideoUiPlugin in ui-compose/api/jvm.
  DesktopUiPlugin: ['VideoUiPlugin'],
};

// Every dump, kept whole, so a supertype can be looked up by the name its
// subclass records. Keyed by FULL name here; nativeClasses() below is the
// simple-name index the web side matches against.
function nativeDumps(): Map<string, NativeClass>[] {
  const dumps: Map<string, NativeClass>[] = [];
  for (const repo of Object.values(NATIVE)) {
    for (const dump of jvmDumps(repo)) dumps.push(parseAbiDump(dump));
  }
  return dumps;
}

function nativeClasses(): Map<string, NativeClass> {
  const merged = new Map<string, NativeClass>();

  for (const repo of Object.values(NATIVE)) {
    for (const dump of jvmDumps(repo)) {
    for (const [name, declared] of parseAbiDump(dump)) {
      // Keyed by the simple name: the packages differ by design (a Kotlin
      // plugin lives under tv.nomercy.player.*) and the class name is what both
      // sides call the thing.
      merged.set(name.split('/').pop() ?? name, declared);
    }
    }
  }

  return merged;
}

/**
 * A plugin is graded through its classes.
 *
 * Matching every plugin declaration against every native name would count a
 * helper called `parse` as ported because some unrelated class has one. Scoping
 * to the plugin's own classes is what makes a hit mean something.
 */
export function comparePlugins(declarations: PluginDeclaration[] = readPluginSurface()): PluginResult[] {
  const byPlugin = new Map<string, PluginDeclaration[]>();
  for (const declaration of declarations) {
    byPlugin.set(declaration.plugin, [...(byPlugin.get(declaration.plugin) ?? []), declaration]);
  }

  const native = nativeClasses();
  const dumps = nativeDumps();
  const waived: Record<string, string> = JSON.parse(readFileSync(WAIVERS, 'utf8'));
  const results: PluginResult[] = [];

  const candidatesFor = (name: string): NativeClass[] =>
    (ALIASES[name] ?? [name]).map(candidate => native.get(candidate)).filter(found => found !== undefined);

  for (const [plugin, entries] of byPlugin) {
    const owners: string[] = [...new Set(entries.map(entry => entry.owner).filter(name => name !== undefined))];

    const classes = owners.map(name => ({ name, ported: candidatesFor(name).length > 0 }));
    // Public members only.
    //
    // A private method is the plugin's own machinery — `makeBox`,
    // `rebuildChain`, `detectMobile` — and it is DOM and Web Audio plumbing
    // that a Compose port answers with a different mechanism, not a same-named
    // method. Grading it demanded the port reproduce a browser, and that is
    // where two thirds of the plugin gap came from. Protected is the same
    // argument one step weaker: it is a subclassing seam, not a consumer's.
    const members = entries.filter(entry =>
      entry.exported
      && entry.owner !== undefined
      && entry.kind === 'method'
      && (entry.visibility ?? 'public') === 'public');

    const missing: string[] = [];
    const waivedHere: string[] = [];
    let present = 0;

    for (const member of members) {
      // INHERITED members count, because a consumer can call them.
      //
      // This read each class's own block only, so `use` and `dispose` — which
      // every plugin gets from the base Plugin and which the base plainly
      // declares — were scored missing on all of them. DrmPlugin passed purely
      // because it happens to override `use` itself, which is what made the
      // pattern look like real absence rather than an unwalked supertype.
      const has = candidatesFor(member.owner as string)
        .some(declared => indexMembers(resolveMembers(declared.name, dumps)).has(member.name));

      const qualified = `${member.owner}.${member.name}`;

      // A method whose parameters or return type are browser objects — an
      // AudioNode, an HTMLCanvasElement, a MediaKeys, an EventTarget — cannot
      // be ported, only imitated, and the ledger already carries that ruling
      // for the player surface. Counting them as gaps made the denominator a
      // measure of how much of a browser this port reproduces rather than how
      // much of the player it implements.
      //
      // Waived, not hidden: every entry names its reason in waivers.json and
      // the report prints the count, so the number can be argued with.
      if (has) present += 1;
      else if (waived[qualified] !== undefined) waivedHere.push(qualified);
      else missing.push(qualified);
    }

    // Options, matched by NAME across the plugin's whole native surface.
    //
    // Not by owner, the way methods are matched. The web declares its options as
    // fields on an interface — `KeyHandlerOptions.scope` — and Kotlin puts the
    // same choice on the plugin's constructor or on a data class with a
    // different name, so an owner-keyed comparison would report every option on
    // every plugin as missing. That is a flood of false gaps, which is the
    // failure this whole tool has cost the most on.
    //
    // The check that DOES mean something is whether the choice can be made at
    // all: an option nobody can set is a behaviour the port has decided for the
    // consumer. `scope` was exactly that — the web defaults it to 'document' and
    // the port had no such switch, so every shortcut died whenever anything else
    // took focus, and a report comparing only method names could never see it.
    const optionEntries = entries.filter(entry =>
      entry.exported && entry.kind === 'option');

    // Searched across the LIBRARY's whole public surface, not the classes this
    // plugin's owners resolve to.
    //
    // An option is a question about whether a choice can be made at all, and
    // the two sides put the same choice in different places: the web declares
    // `DesktopUiButtonOptions.aspectRatio` on an interface, Kotlin puts it on a
    // `ChromeButtons` data class in another module. Resolving by owner name
    // found no `DesktopUiButtonOptions` and reported all thirty-five as
    // missing, including the eight passed to ChromeButtons by this repo's own
    // tests. Thirty-five false gaps on one plugin is the kind of number that
    // gets working code rewritten.
    //
    // Looser than the method comparison on purpose. A method has an owner that
    // means something; an option is a name a consumer sets. This errs toward
    // silence rather than toward crying wolf, and the rule is stated in the
    // report so the number can be argued with.
    // A Kotlin property reaches the ABI as `getAspectRatio`; the field the web
    // declares is `aspectRatio`. Compared raw the two never match and EVERY
    // option on every plugin reads missing — which is what the first run
    // reported, 14 of 123, with `aspectRatio` among the gaps while this repo's
    // own tests were passing it to ChromeButtons.
    const propertyName = (name: string): string => {
      const stripped = name.replace(/^(get|set|is)(?=[A-Z])/, '');
      return stripped.charAt(0).toLowerCase() + stripped.slice(1);
    };

    const nativeNames = new Set<string>(
      dumps.flatMap(dump =>
        [...dump.values()].flatMap(declared =>
          declared.members.flatMap(member => [member.name, propertyName(member.name)]))),
    );

    const optionsMissing: string[] = [];
    let optionsPresent = 0;

    for (const option of optionEntries) {
      const qualified = option.owner === undefined
        ? option.name
        : `${option.owner}.${option.name}`;

      if (nativeNames.has(option.name) || waived[qualified] !== undefined) optionsPresent += 1;
      else optionsMissing.push(qualified);
    }

    results.push({
      plugin,
      // The extractor sweeps each package and files everything outside
      // plugins/ under `<package>/src`. Those are adapters, parsers and kit
      // internals — real surface, and not a plugin. Counted together they put
      // 467 declarations into a plugin denominator and turned "how much of the
      // chrome exists" into a number about the cue parsers.
      isPlugin: !plugin.endsWith('/src'),
      classes,
      total: members.length - waivedHere.length,
      present,
      waived: waivedHere.sort(),
      missing: missing.sort(),
      options: {
        total: optionEntries.length,
        present: optionsPresent,
        missing: optionsMissing.sort(),
      },
    });
  }

  return results.sort((a, b) => a.plugin.localeCompare(b.plugin));
}
