import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { indexMembers } from './compare';
import { NativeClass, parseAbiDump } from './native-surface';
import { NATIVE, REPO_ROOT } from './paths';

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
};

function nativeClasses(): Map<string, NativeClass> {
  const merged = new Map<string, NativeClass>();

  for (const repo of Object.values(NATIVE)) {
    for (const [name, declared] of parseAbiDump(repo.jvmApi)) {
      // Keyed by the simple name: the packages differ by design (a Kotlin
      // plugin lives under tv.nomercy.player.*) and the class name is what both
      // sides call the thing.
      merged.set(name.split('/').pop() ?? name, declared);
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
  const results: PluginResult[] = [];

  const candidatesFor = (name: string): NativeClass[] =>
    (ALIASES[name] ?? [name]).map(candidate => native.get(candidate)).filter(found => found !== undefined);

  for (const [plugin, entries] of byPlugin) {
    const owners: string[] = [...new Set(entries.map(entry => entry.owner).filter(name => name !== undefined))];

    const classes = owners.map(name => ({ name, ported: candidatesFor(name).length > 0 }));
    const members = entries.filter(entry => entry.exported && entry.owner !== undefined && entry.kind === 'method');

    const missing: string[] = [];
    let present = 0;

    for (const member of members) {
      const has = candidatesFor(member.owner as string)
        .some(declared => indexMembers(declared.members).has(member.name));

      if (has) present += 1;
      else missing.push(`${member.owner}.${member.name}`);
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
      total: members.length,
      present,
      missing: missing.sort(),
    });
  }

  return results.sort((a, b) => a.plugin.localeCompare(b.plugin));
}
