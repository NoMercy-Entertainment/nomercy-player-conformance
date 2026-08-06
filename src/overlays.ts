// -----------------------------------------------------------------------------
//  Copyright (c) NoMercy Entertainment
//
//  Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
//  SPDX-License-Identifier: Apache-2.0
// -----------------------------------------------------------------------------

/**
 * Does every overlay element the web player draws have a native counterpart?
 *
 * The web side is MEASURED, not declared: `scripts/web-overlay-geometry.mjs`
 * walks the live player stage and records every element that carries an id,
 * with its box as a fraction of the container. Declared geometry and laid-out
 * geometry are different numbers the moment a flex parent or a breakpoint is
 * involved, and the whole point of this pass is to measure what is on screen.
 *
 * The native side is its test tags, read out of the Compose sources. A tag is
 * what a UI test can address and what a screenshot comparison can find, so an
 * element without one has no counterpart that can be checked even if it is
 * drawn.
 *
 * The map is the deliverable. Web ids and native tags do not share a naming
 * scheme — `playback` against `nm-play-pause`, `slider-bar` against
 * `nm-scrubber` — so the correspondence has to be stated somewhere, and stating
 * it is what turns "the overlay looks about right" into a count.
 */

export interface MeasuredElement {
	name: string;
	tag: string;
	left: number;
	top: number;
	width: number;
	height: number;
	widthPx: number;
	heightPx: number;
}

export interface OverlayMeasurement {
	container: { width: number; height: number };
	elements: MeasuredElement[];
}

/**
 * Web element id → the native test tag that draws the same thing.
 *
 * `null` means the element is deliberately not expected natively, with the
 * reason beside it. An id absent from this map altogether is an UNMAPPED gap —
 * the report counts those, so a new overlay element on the web shows up here
 * rather than passing silently.
 */
export const OVERLAY_COUNTERPARTS: Record<string, string | null> = {
	// ── Top bar ──
	'top-bar': 'nm-chrome-top-bar',
	'top-bar-left': null, // A flex half of the top bar. The bar itself is the element.
	'top-bar-right': null, // Ditto.
	'back-btn': 'nm-chrome-back',
	'cast-btn': 'nm-chrome-cast',
	'close-btn': 'nm-chrome-close',

	// ── Scrubber ──
	'top-row': null, // The row the scrubber sits in; the scrubber is the element.
	'slider-bar': 'nm-scrubber',
	'chapter-progress': 'nm-chapter-bar',
	'slider-buffer': null, // Painted inside nm-scrubber rather than as its own node.
	'slider-progress': null, // Ditto.

	// ── Transport ──
	'bottom-row': 'nm-transport-bar',
	'playback': 'nm-play-pause',
	'previous': 'nm-previous',
	'next': 'nm-next',
	'subtitles': 'nm-subtitles',
	'chapter-back': 'nm-chapter-back',
	'chapter-forward': 'nm-chapter-forward',
	'volume-container': 'nm-volume-control',
	'volume': 'nm-volume',
	'aspect-ratio': 'nm-aspect-ratio',
	'theater': 'nm-theater',
	'pip': 'nm-pip',
	'speed': 'nm-speed',
	'quality': 'nm-quality',
	'playlist': 'nm-playlist',
	'settings': 'nm-settings',
	'fullscreen': 'nm-chrome-fullscreen',

	// ── Readouts and framing ──
	'title': 'nm-chrome-episode',
	'current-time': null, // Drawn as text inside nm-transport-bar, not a tagged node.
	'remaining-time': null, // Ditto.
	'center': null, // The full-bleed hit area behind the chrome, not a drawn element.
	'bottom-bar-shadow': null, // A gradient, not an element with behaviour.
	'show-info': null, // A subtitle line inside the title block.

	// ── Overlays ──
	'spinner': 'nm-chrome-buffering',
	'subtitle-safezone': 'nm-subtitle-cues',
};

/** Every `nm-…` test tag the Compose sources assign. */
export function nativeTags(sources: string[]): Set<string> {
	const found = new Set<string>();
	for (const text of sources) {
		for (const match of text.matchAll(/"(nm-[a-z0-9-]+)"/g)) found.add(match[1]);
	}
	return found;
}

export interface OverlayFinding {
	id: string;
	verdict: 'matched' | 'unmapped' | 'missing' | 'waived';
	nativeTag?: string;
	note?: string;
}

export function compareOverlays(
	measured: OverlayMeasurement,
	tags: Set<string>,
): { findings: OverlayFinding[]; matched: number; total: number } {
	const findings: OverlayFinding[] = [];

	for (const element of measured.elements) {
		const mapped = OVERLAY_COUNTERPARTS[element.name];

		if (mapped === undefined) {
			findings.push({
				id: element.name,
				verdict: 'unmapped',
				note: 'no counterpart declared — a new overlay element, or one nobody has looked at',
			});
			continue;
		}

		if (mapped === null) {
			findings.push({ id: element.name, verdict: 'waived' });
			continue;
		}

		findings.push(
			tags.has(mapped)
				? { id: element.name, verdict: 'matched', nativeTag: mapped }
				: { id: element.name, verdict: 'missing', nativeTag: mapped, note: 'declared counterpart carries no such tag natively' },
		);
	}

	// Waived elements leave the denominator: they are not things a port owes.
	const counted = findings.filter(f => f.verdict !== 'waived');
	return {
		findings,
		matched: counted.filter(f => f.verdict === 'matched').length,
		total: counted.length,
	};
}
