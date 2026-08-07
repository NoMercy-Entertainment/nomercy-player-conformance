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
	// The bottom stack: the scrubber row and the transport row together. The
	// native chrome composes the same two, and the box around them is the
	// element a layout comparison can address.
	//
	// It pointed at nm-desktop-chrome until a geometry diff ran over it. That
	// tag is the full-bleed chrome ROOT, so an eighty-pixel strip was being
	// compared against the whole screen and came back off by 0.889 in both top
	// and height — the size of the screen, not of a defect. The stack now
	// carries its own tag.
	'bottom-bar': 'nm-bottom-stack',

	// The bubble a scrub drags along the bar, its frame, and the two lines of
	// text under it. All four are drawn only while a scrub is in progress,
	// which is why they arrived in the measurement late — the page had to be
	// hovered before they existed to find.
	'slider-pop-image': 'nm-scrub-frame',
	'slider-text': 'nm-scrub-time',
	'chapter-text': 'nm-scrub-chapter',
	'top-row': null, // The row the scrubber sits in; the scrubber is the element.
	// Native draws ONE bar where the web stacks two boxes of the same eight
	// pixels: `#slider-bar` is the track and `#chapter-progress` the chapter
	// overlay inside it. That single drawn bar is nm-chapter-bar, paired below,
	// and it matches the reference exactly.
	//
	// Not paired with nm-scrubber, which is the 32dp POINTER TARGET wrapped
	// around the drawn bar and has no web counterpart — an eight-pixel drag
	// target is one nobody hits with a finger. Pairing them compared a hit area
	// against a drawn line and reported the difference as a layout defect.
	'slider-bar': null,
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
	// The two lines, each to its own. `#title` is the show and `.show-info` the
	// episode under it; native tagged only the second, so a comparison pairing
	// what was available put the first line against the second and called both
	// misplaced.
	'title': 'nm-chrome-title',
	'current-time': null, // Drawn as text inside nm-transport-bar, not a tagged node.
	'remaining-time': null, // Ditto.
	'center': null, // The full-bleed hit area behind the chrome, not a drawn element.
	'bottom-bar-shadow': null, // A gradient, not an element with behaviour.
	'show-info': 'nm-chrome-episode',

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

/**
 * Does the counterpart land where the reference lays it out?
 *
 * Height and width are compared in the player's own units — a 40dp button and a
 * 40px button are the same button, and that is the number a viewer sees. Left
 * and top are compared NORMALISED, because the two players are not the same
 * size on screen and a control anchored to the right edge sits at a different
 * absolute x in each.
 *
 * A control that spans the container is exempt from the width check: it is as
 * wide as it was given, and comparing 992 against 966 measures the two
 * fixtures' widths rather than the two layouts.
 */
export interface GeometryFinding {
	id: string;
	nativeTag: string;
	what: 'height' | 'width' | 'left' | 'top';
	web: number;
	native: number;
}

const SPANS_CONTAINER = 0.9;

export function compareGeometry(
	web: OverlayMeasurement,
	native: OverlayMeasurement,
	tolerancePx = 1,
	toleranceFraction = 0.02,
): GeometryFinding[] {
	const nativeByTag = new Map(native.elements.map(e => [e.name, e]));
	const findings: GeometryFinding[] = [];

	// Horizontal position is measured against the BAR, not the container.
	//
	// The controls pack from the bar's two ends, and the bar is not the same
	// fraction of the container in both players — so a fullscreen button
	// correctly pinned to the bar's right edge reads as 0.94 on one side and
	// 0.76 on the other, and four correctly-placed controls came back as
	// findings. What has to match is where a control sits ALONG THE BAR.
	const webBar = web.elements.find(e => e.name === 'bottom-row');
	const nativeBar = nativeByTag.get('nm-transport-bar');
	const alongWebBar = (element: MeasuredElement): number =>
		webBar ? (element.left - webBar.left) / webBar.width : element.left;
	const alongNativeBar = (element: MeasuredElement): number =>
		nativeBar ? (element.left - nativeBar.left) / nativeBar.width : element.left;

	const inBar = (elements: MeasuredElement[], bar?: MeasuredElement): number =>
		bar ? elements.filter(e => e !== bar && e.top >= bar.top - 0.01 && e.top < bar.top + bar.height + 0.01).length : 0;
	const comparableRuns = inBar(web.elements, webBar) === inBar(native.elements, nativeBar);

	for (const element of web.elements) {
		const tag = OVERLAY_COUNTERPARTS[element.name];
		if (!tag) continue;

		const counterpart = nativeByTag.get(tag);
		if (!counterpart) continue;

		if (Math.abs(counterpart.heightPx - element.heightPx) > tolerancePx) {
			findings.push({ id: element.name, nativeTag: tag, what: 'height', web: element.heightPx, native: counterpart.heightPx });
		}

		const spans = element.width >= SPANS_CONTAINER || counterpart.width >= SPANS_CONTAINER;
		if (!spans && Math.abs(counterpart.widthPx - element.widthPx) > tolerancePx) {
			findings.push({ id: element.name, nativeTag: tag, what: 'width', web: element.widthPx, native: counterpart.widthPx });
		}

		if (Math.abs(counterpart.top - element.top) > toleranceFraction) {
			findings.push({ id: element.name, nativeTag: tag, what: 'top', web: element.top, native: counterpart.top });
		}

		// Only when both sides drew the same controls.
		//
		// The bar packs from its ends, so one absent control shifts every
		// control after it and the whole tail reads as misplaced. The native
		// fixture's item carries no chapters, so its `next` sits two slots
		// earlier than the web page's — which is a difference between two
		// fixtures, not between two layouts, and reporting it as geometry is
		// the same class of mistake as measuring against the wrong container.
		//
		// Order along the bar is the invariant that survives a missing control,
		// and it has its own report: see chrome-report.
		const webX = alongWebBar(element);
		const nativeX = alongNativeBar(counterpart);
		if (comparableRuns && Math.abs(nativeX - webX) > toleranceFraction) {
			findings.push({
				id: element.name,
				nativeTag: tag,
				what: 'left',
				web: Math.round(webX * 10000) / 10000,
				native: Math.round(nativeX * 10000) / 10000,
			});
		}
	}

	return findings;
}
