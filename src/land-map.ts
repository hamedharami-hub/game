/**
 * A small, accessible map for landmarks on the shared Two-Horn landscape.
 * Coordinates are the existing world x/z positions: +x is right and +z is down.
 * This component only reports a selection; it does not move an actor, replace
 * the scene, or read/write saved game state.
 *
 * `main.ts` can mount it next to the existing world, passing the district
 * coordinates through unchanged:
 *
 * ```ts
 * import { districts, type District } from './world';
 * import { renderLandMap } from './land-map';
 *
 * const map = renderLandMap(
 *   $('land-map'),
 *   Object.entries(districts).map(([id, place]) => ({
 *     id, name: place.name, x: place.x, z: place.z,
 *     icon: place.icon, color: place.color, description: place.subtitle,
 *   })),
 *   landmark => {
 *     districtWorld.activate(landmark.id as District);
 *     setStatus(`نشان انتخاب‌شده: ${landmark.name}`);
 *     // Optional: set the game's existing click-to-walk target here. Do not
 *     // copy landmark coordinates directly onto an actor's position.
 *   },
 *   { selectedId: 'garden', playerPosition: { x: angel.position.x, z: angel.position.z } },
 * );
 *
 * // Call during the existing animation update; this only moves the marker.
 * map.setPlayerPosition({ x: angel.position.x, z: angel.position.z });
 * ```
 */

export interface LandMapWorldPosition {
  readonly x: number;
  readonly z: number;
}

export interface LandMapWorldBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface LandMapLandmark extends LandMapWorldPosition {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  readonly color?: string;
  readonly description?: string;
}

export interface LandMapProjectionOptions {
  /** SVG viewBox width. Defaults to 288. */
  readonly width?: number;
  /** SVG viewBox height. Defaults to 232. */
  readonly height?: number;
  /** Safe margin inside the viewBox. Defaults to 42. */
  readonly padding?: number;
  /** Optional fixed world extent, useful when the player marker is updated. */
  readonly worldBounds?: LandMapWorldBounds;
}

export interface LandMapOptions extends LandMapProjectionOptions {
  readonly label?: string;
  readonly selectedId?: string | null;
  readonly playerPosition?: LandMapWorldPosition | null;
}

export interface ProjectedLandMapLandmark extends LandMapLandmark {
  readonly mapX: number;
  readonly mapY: number;
}

export interface LandMapUpdateOptions {
  readonly selectedId?: string | null;
  readonly playerPosition?: LandMapWorldPosition | null;
}

export interface LandMapHandle {
  /** Set the visually and accessibly selected landmark without rebuilding the map. */
  setSelected(id: string | null): void;
  /** Update only the player marker. Positions outside the map frame are edge-clamped. */
  setPlayerPosition(position: LandMapWorldPosition | null): void;
  /** Replace landmarks and optionally update selection or player position. */
  update(landmarks: readonly LandMapLandmark[], options?: LandMapUpdateOptions): void;
  /** Remove the map and its delegated event listeners. */
  destroy(): void;
}

const DEFAULT_WIDTH = 288;
const DEFAULT_HEIGHT = 232;
const DEFAULT_PADDING = 42;
const DEFAULT_LABEL = 'نقشهٔ کوچک سرزمین دوشاخ‌ها';
const LANDMARK_CONTROL_SELECTOR = '[data-landmark-control="true"][data-landmark-id]';

type Projection = {
  width: number;
  height: number;
  padding: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  left: number;
  top: number;
  scale: number;
};

type ProjectedPosition = {
  mapX: number;
  mapY: number;
  markerX: number;
  markerY: number;
  isOutside: boolean;
  angle: number;
};

interface LandmarkControlElement {
  readonly tagName?: string;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
}

interface QueryableLandMapContainer extends HTMLElement {
  querySelectorAll<E extends Element = Element>(selectors: string): NodeListOf<E>;
  querySelector<E extends Element = Element>(selectors: string): E | null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => {
    switch (character) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return character;
    }
  });
}

function numberText(value: number): string {
  return String(Number(value.toFixed(3)));
}

function validateLandmarks(landmarks: readonly LandMapLandmark[]): readonly LandMapLandmark[] {
  if (!Array.isArray(landmarks)) throw new TypeError('Landmarks must be an array.');
  const ids = new Set<string>();
  for (const landmark of landmarks) {
    if (!landmark || typeof landmark !== 'object') throw new TypeError('Each landmark must be an object.');
    if (typeof landmark.id !== 'string' || !landmark.id.trim()) throw new TypeError('Each landmark needs a non-empty id.');
    if (ids.has(landmark.id)) throw new TypeError(`Duplicate landmark id: ${landmark.id}`);
    ids.add(landmark.id);
    if (typeof landmark.name !== 'string' || !landmark.name.trim()) throw new TypeError(`Landmark ${landmark.id} needs a name.`);
    if (!Number.isFinite(landmark.x) || !Number.isFinite(landmark.z)) {
      throw new TypeError(`Landmark ${landmark.id} needs finite x/z coordinates.`);
    }
  }
  return landmarks;
}

function validatePosition(position: LandMapWorldPosition | null): LandMapWorldPosition | null {
  if (position === null) return null;
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) {
    throw new TypeError('A player position needs finite x/z coordinates, or null.');
  }
  return position;
}

function validateBounds(bounds: LandMapWorldBounds | undefined): LandMapWorldBounds | undefined {
  if (bounds === undefined) return undefined;
  if (!bounds
    || !Number.isFinite(bounds.minX) || !Number.isFinite(bounds.maxX)
    || !Number.isFinite(bounds.minZ) || !Number.isFinite(bounds.maxZ)
    || bounds.minX > bounds.maxX || bounds.minZ > bounds.maxZ) {
    throw new RangeError('World bounds must contain finite, ordered min/max coordinates.');
  }
  return bounds;
}

function createProjection(
  landmarks: readonly LandMapLandmark[],
  options: LandMapProjectionOptions = {},
): Projection {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const padding = options.padding ?? DEFAULT_PADDING;
  const worldBounds = validateBounds(options.worldBounds);
  if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(padding)
    || width <= 0 || height <= 0 || padding < 0 || width <= padding * 2 || height <= padding * 2) {
    throw new RangeError('Map width and height must be positive and larger than twice the padding.');
  }

  let minX = worldBounds?.minX ?? Infinity;
  let maxX = worldBounds?.maxX ?? -Infinity;
  let minZ = worldBounds?.minZ ?? Infinity;
  let maxZ = worldBounds?.maxZ ?? -Infinity;
  for (const landmark of landmarks) {
    minX = Math.min(minX, landmark.x);
    maxX = Math.max(maxX, landmark.x);
    minZ = Math.min(minZ, landmark.z);
    maxZ = Math.max(maxZ, landmark.z);
  }
  if (!Number.isFinite(minX)) { minX = -1; maxX = 1; minZ = -1; maxZ = 1; }
  if (maxX === minX) { minX -= 0.5; maxX += 0.5; }
  if (maxZ === minZ) { minZ -= 0.5; maxZ += 0.5; }

  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanZ);
  const projectedWidth = spanX * scale;
  const projectedHeight = spanZ * scale;
  return {
    width, height, padding, minX, maxX, minZ, maxZ,
    left: (width - projectedWidth) / 2,
    top: (height - projectedHeight) / 2,
    scale,
  };
}

function projectPosition(position: LandMapWorldPosition, projection: Projection): ProjectedPosition {
  const mapX = projection.left + (position.x - projection.minX) * projection.scale;
  const mapY = projection.top + (position.z - projection.minZ) * projection.scale;
  const markerX = Math.max(projection.padding, Math.min(projection.width - projection.padding, mapX));
  const markerY = Math.max(projection.padding, Math.min(projection.height - projection.padding, mapY));
  const isOutside = mapX < projection.padding || mapX > projection.width - projection.padding
    || mapY < projection.padding || mapY > projection.height - projection.padding;
  return {
    mapX,
    mapY,
    markerX,
    markerY,
    isOutside,
    angle: Math.atan2(mapY - markerY, mapX - markerX) * 180 / Math.PI + 90,
  };
}

/** Project world x/z coordinates into an aspect-preserving SVG viewBox. */
export function projectLandmarks(
  input: readonly LandMapLandmark[],
  options: LandMapProjectionOptions = {},
): ProjectedLandMapLandmark[] {
  const landmarks = validateLandmarks(input);
  const projection = createProjection(landmarks, options);
  return landmarks.map(landmark => {
    const point = projectPosition(landmark, projection);
    return { ...landmark, mapX: point.mapX, mapY: point.mapY };
  });
}

function safeColor(color: string | undefined, index: number): string {
  if (color && /^#[\da-f]{3}(?:[\da-f]|[\da-f]{3})?$/i.test(color)) return color;
  const fallback = ['#c35b79', '#3e846e', '#b57a43', '#9270ad', '#387c9a', '#927c38'];
  return fallback[index % fallback.length];
}

function getLandPath(width: number, height: number): string {
  const x = (fraction: number) => numberText(width * fraction);
  const y = (fraction: number) => numberText(height * fraction);
  return `M ${x(.13)} ${y(.50)} C ${x(.105)} ${y(.36)}, ${x(.20)} ${y(.21)}, ${x(.34)} ${y(.16)} C ${x(.48)} ${y(.08)}, ${x(.68)} ${y(.13)}, ${x(.79)} ${y(.23)} C ${x(.92)} ${y(.33)}, ${x(.92)} ${y(.58)}, ${x(.85)} ${y(.70)} C ${x(.78)} ${y(.84)}, ${x(.62)} ${y(.91)}, ${x(.46)} ${y(.87)} C ${x(.30)} ${y(.90)}, ${x(.16)} ${y(.76)}, ${x(.13)} ${y(.62)} C ${x(.11)} ${y(.57)}, ${x(.11)} ${y(.54)}, ${x(.13)} ${y(.50)} Z`;
}

function formatPlayerLabel(position: LandMapWorldPosition | null, isOutside: boolean): string {
  if (!position) return 'موقعیت بازیکن نمایش داده نمی‌شود';
  const outsideNote = isOutside ? '، بیرون از قاب نقشه' : '';
  return `موقعیت بازیکن: x ${numberText(position.x)}، z ${numberText(position.z)}${outsideNote}`;
}

function renderPlayerMarker(position: LandMapWorldPosition | null, projection: Projection): string {
  const projected = position ? projectPosition(position, projection) : null;
  const transform = projected
    ? `translate(${numberText(projected.markerX)} ${numberText(projected.markerY)})`
    : 'translate(0 0)';
  const display = position ? '' : 'display="none"';
  const hidden = position ? 'false' : 'true';
  const label = escapeHtml(formatPlayerLabel(position, projected?.isOutside ?? false));
  const arrowDisplay = projected?.isOutside ? '' : 'display="none"';
  const arrowRotation = projected ? numberText(projected.angle) : '0';
  return `<g class="land-map__player" data-player-marker="true" role="img" aria-label="${label}" aria-hidden="${hidden}" ${display} transform="${transform}"><circle class="land-map__player-dot" r="7"/><path class="land-map__player-arrow" ${arrowDisplay} transform="rotate(${arrowRotation}) translate(0 -9)" d="M 0 -5 L 4 4 L -4 4 Z"/></g>`;
}

function renderLandmarkMarkers(
  landmarks: readonly LandMapLandmark[],
  projected: readonly ProjectedLandMapLandmark[],
  selectedId: string | null,
): string {
  return projected.map((landmark, index) => {
    const active = landmark.id === selectedId;
    const ariaName = `${index + 1}. ${landmark.name}${landmark.description ? ` — ${landmark.description}` : ''}`;
    return `<g class="land-map__marker" data-landmark-control="true" data-landmark-id="${escapeHtml(landmark.id)}" role="button" tabindex="0" aria-label="${escapeHtml(ariaName)}" aria-pressed="${active}" transform="translate(${numberText(landmark.mapX)} ${numberText(landmark.mapY)})"><circle r="10.5" fill="${escapeHtml(safeColor(landmark.color, index))}"/><text x="0" y="3.2" text-anchor="middle" aria-hidden="true">${index + 1}</text></g>`;
  }).join('');
}

/** Render accessible static markup; use `renderLandMap` to attach selection handlers. */
export function renderLandMapMarkup(
  input: readonly LandMapLandmark[],
  options: LandMapOptions = {},
): string {
  const landmarks = validateLandmarks(input);
  const projection = createProjection(landmarks, options);
  const projected = projectLandmarks(landmarks, options);
  const label = escapeHtml(options.label ?? DEFAULT_LABEL);
  const selectedId = landmarks.some(item => item.id === options.selectedId) ? options.selectedId ?? null : null;
  const playerPosition = validatePosition(options.playerPosition ?? null);
  const emptyState = landmarks.length ? '' : '<p class="land-map__empty">مکانی برای نمایش در نقشه نیست.</p>';
  const mapItems = landmarks.map((landmark, index) => {
    const active = landmark.id === selectedId;
    const icon = landmark.icon ? `<span class="land-map__icon" aria-hidden="true">${escapeHtml(landmark.icon)}</span>` : '';
    return `<li><button class="land-map__button" type="button" data-landmark-control="true" data-landmark-id="${escapeHtml(landmark.id)}" aria-pressed="${active}"${landmark.description ? ` title="${escapeHtml(landmark.description)}"` : ''}><span class="land-map__index" aria-hidden="true">${index + 1}</span>${icon}<span class="land-map__name">${escapeHtml(landmark.name)}</span></button></li>`;
  }).join('');
  const selectedLandmark = landmarks.find(item => item.id === selectedId);
  const initialStatus = selectedLandmark ? `${selectedLandmark.name} انتخاب شده است.` : '';
  const landPath = getLandPath(projection.width, projection.height);

  return `<section class="land-map" aria-label="${label}" data-land-map="true"><div class="land-map__heading"><h2 class="land-map__title">${label}</h2><p class="land-map__subtitle">یک سرزمین پیوسته</p></div><svg class="land-map__visual" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${numberText(projection.width)} ${numberText(projection.height)}" role="group" aria-label="${label}؛ مکان‌ها روی یک دشت پیوسته"><rect class="land-map__water" width="${numberText(projection.width)}" height="${numberText(projection.height)}" rx="16"/><path class="land-map__land" d="${landPath}"/><path class="land-map__shore" d="${landPath}"/>${renderLandmarkMarkers(landmarks, projected, selectedId)}${renderPlayerMarker(playerPosition, projection)}</svg>${emptyState}<ol class="land-map__landmarks" aria-label="انتخاب یک مکان">${mapItems}</ol><p class="land-map__status" data-land-map-status="true" role="status" aria-live="polite">${escapeHtml(initialStatus)}</p></section>`;
}

/**
 * Mount the map in a dedicated container. Landmark buttons and SVG markers
 * share the same callback and remain operable with touch, mouse, Enter, and
 * Space. Selecting only invokes `onSelect`; movement or camera behavior stays
 * with the host game.
 */
export function renderLandMap(
  container: HTMLElement,
  input: readonly LandMapLandmark[],
  onSelect: (landmark: LandMapLandmark) => void,
  options: LandMapOptions = {},
): LandMapHandle {
  if (typeof onSelect !== 'function') throw new TypeError('A landmark selection callback is required.');
  let landmarks = validateLandmarks(input);
  let selectedId = landmarks.some(item => item.id === options.selectedId) ? options.selectedId ?? null : null;
  let playerPosition = validatePosition(options.playerPosition ?? null);
  const projectionOptions: LandMapProjectionOptions = {
    width: options.width,
    height: options.height,
    padding: options.padding,
    worldBounds: options.worldBounds,
  };
  let projection = createProjection(landmarks, projectionOptions);
  let isDestroyed = false;
  const root = container as QueryableLandMapContainer;

  const currentOptions = (): LandMapOptions => ({
    ...projectionOptions,
    label: options.label,
    selectedId,
    playerPosition,
  });
  const render = () => {
    projection = createProjection(landmarks, projectionOptions);
    root.innerHTML = renderLandMapMarkup(landmarks, currentOptions());
  };
  const updatePressedState = () => {
    for (const control of root.querySelectorAll<HTMLElement>(LANDMARK_CONTROL_SELECTOR)) {
      control.setAttribute('aria-pressed', String(control.getAttribute('data-landmark-id') === selectedId));
    }
    const status = root.querySelector<HTMLElement>('[data-land-map-status="true"]');
    if (status) {
      const selected = landmarks.find(item => item.id === selectedId);
      status.textContent = selected ? `${selected.name} انتخاب شده است.` : '';
    }
  };
  const updatePlayerMarker = () => {
    const marker = root.querySelector<SVGElement>('[data-player-marker="true"]');
    if (!marker) return;
    const projected = playerPosition ? projectPosition(playerPosition, projection) : null;
    marker.setAttribute('display', playerPosition ? 'inline' : 'none');
    marker.setAttribute('aria-hidden', playerPosition ? 'false' : 'true');
    marker.setAttribute('aria-label', formatPlayerLabel(playerPosition, projected?.isOutside ?? false));
    marker.setAttribute('transform', projected
      ? `translate(${numberText(projected.markerX)} ${numberText(projected.markerY)})`
      : 'translate(0 0)');
    const arrow = marker.querySelector<SVGElement>('.land-map__player-arrow');
    if (arrow) {
      arrow.setAttribute('display', projected?.isOutside ? 'inline' : 'none');
      arrow.setAttribute('transform', `rotate(${numberText(projected?.angle ?? 0)}) translate(0 -9)`);
    }
  };
  const findControl = (target: EventTarget | null): LandmarkControlElement | null => {
    if (!target || typeof (target as { closest?: unknown }).closest !== 'function') return null;
    return (target as unknown as { closest(selector: string): LandmarkControlElement | null })
      .closest(LANDMARK_CONTROL_SELECTOR);
  };
  const selectFromControl = (control: LandmarkControlElement) => {
    const id = control.getAttribute('data-landmark-id');
    const selected = landmarks.find(item => item.id === id);
    if (!selected) return;
    selectedId = selected.id;
    updatePressedState();
    onSelect(selected);
  };
  const onClick = (event: Event) => {
    const control = findControl(event.target);
    if (control) selectFromControl(control);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
    const control = findControl(event.target);
    if (!control || control.tagName?.toLowerCase() === 'button') return;
    event.preventDefault();
    selectFromControl(control);
  };

  render();
  container.addEventListener('click', onClick);
  container.addEventListener('keydown', onKeyDown);

  return {
    setSelected(id) {
      if (isDestroyed) return;
      selectedId = landmarks.some(item => item.id === id) ? id : null;
      updatePressedState();
    },
    setPlayerPosition(position) {
      if (isDestroyed) return;
      playerPosition = validatePosition(position);
      updatePlayerMarker();
    },
    update(nextLandmarks, updateOptions = {}) {
      if (isDestroyed) return;
      landmarks = validateLandmarks(nextLandmarks);
      if (Object.hasOwn(updateOptions, 'selectedId')) {
        selectedId = landmarks.some(item => item.id === updateOptions.selectedId) ? updateOptions.selectedId ?? null : null;
      } else if (!landmarks.some(item => item.id === selectedId)) {
        selectedId = null;
      }
      if (Object.hasOwn(updateOptions, 'playerPosition')) playerPosition = validatePosition(updateOptions.playerPosition ?? null);
      render();
      updatePressedState();
    },
    destroy() {
      if (isDestroyed) return;
      isDestroyed = true;
      container.removeEventListener('click', onClick);
      container.removeEventListener('keydown', onKeyDown);
      root.innerHTML = '';
    },
  };
}
