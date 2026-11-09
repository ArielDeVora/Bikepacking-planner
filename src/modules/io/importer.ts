import { STAGE_COLORS } from '../../config/modes';
import { edits, type Change, type Command } from '../../core/commands';
import type { TripStore } from '../../core/store';
import { newId } from '../../model/ids';
import { compareOrder, keyBetween } from '../../model/order';
import { distance } from '../../lib/geo/geo';
import { stageChildren } from '../../lib/tree';
import { importedGeometry } from '../../model/segment';
import type { Poi, Segment, Stage, TravelMode, Zone } from '../../model/types';
import type { ParsedFile, ParsedWaypoint } from './parse';

/**
 * `auto`: files with one track go to `defaultStageId` (or the last stage); files with several
 * tracks each get a new stage named after the file. `perFile`: a new stage for every file.
 * Otherwise the id of the stage to import everything into.
 */
export type ImportTarget = 'auto' | 'perFile' | string;

export interface ImportOptions {
  tripId: string;
  userId: string;
  target: ImportTarget;
  defaultStageId?: string;
  mode: TravelMode;
  waypoints: boolean;
  /** Import polygons as zones of this kind, or not at all. */
  areas?: Zone['kind'] | null;
  label: string;
  stageName: (n: number) => string;
}

export interface ImportResult {
  command: Command;
  segmentIds: string[];
  stageIds: string[];
  /** New POIs. */
  poiCount: number;
  /** Existing POIs the import matched (and updated where something was new). */
  poiMatched: number;
  zoneCount: number;
}

/** Waypoints matching an existing POI: same link, or the same name within this distance. */
const MATCH_M = 300;
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function findExistingPoi(pois: Poi[], w: ParsedWaypoint): Poi | undefined {
  return pois.find(
    (p) =>
      w.links.some((l) => p.links.includes(l)) ||
      (!!w.name && norm(p.name) === norm(w.name) && distance(p.lngLat, w.lngLat) <= MATCH_M),
  );
}

const baseName = (file: string) => file.replace(/\.[^.]+$/, '');

export function buildImport(store: TripStore, files: ParsedFile[], opts: ImportOptions): ImportResult {
  const changes: Change[] = [];
  const stages = store.list('stage').sort(compareOrder);
  let lastStageOrder = stages.at(-1)?.order ?? null;
  const lastSegmentOrder = new Map<string, string | null>();
  const segmentIds: string[] = [];
  const newStages: string[] = [];
  let poiCount = 0;
  let poiMatched = 0;
  let zoneCount = 0;
  const today = new Date().toISOString().slice(0, 10);
  const existingPois = store.list('poi');

  const newStage = (name: string): string => {
    const id = newId();
    lastStageOrder = keyBetween(lastStageOrder, null);
    changes.push(
      edits.create<Stage>({
        id,
        type: 'stage',
        tripId: opts.tripId,
        order: lastStageOrder,
        name,
        notes: '',
        color: STAGE_COLORS[(stages.length + newStages.length) % STAGE_COLORS.length],
      }),
    );
    newStages.push(id);
    return id;
  };

  let shared: string | undefined;
  const sharedStage = (): string => {
    if (shared) return shared;
    const wanted = opts.target !== 'auto' && opts.target !== 'perFile' ? opts.target : opts.defaultStageId;
    shared = (wanted && store.get(wanted, 'stage') ? wanted : stages.at(-1)?.id) ?? newStage(opts.stageName(1));
    return shared;
  };

  const nextOrder = (stageId: string): string => {
    if (!lastSegmentOrder.has(stageId)) {
      lastSegmentOrder.set(stageId, stageChildren(store, stageId).at(-1)?.order ?? null);
    }
    const order = keyBetween(lastSegmentOrder.get(stageId) ?? null, null);
    lastSegmentOrder.set(stageId, order);
    return order;
  };

  for (const file of files) {
    if (file.error || file.backup) continue;
    const own = opts.target === 'perFile' || (opts.target === 'auto' && file.tracks.length > 1);
    const stageId = file.tracks.length ? (own ? newStage(baseName(file.name)) : sharedStage()) : undefined;

    for (const track of file.tracks) {
      const geometry = importedGeometry(track.parts);
      if (geometry.anchors.length < 2) continue;
      const id = newId();
      segmentIds.push(id);
      changes.push(
        edits.create<Segment>({
          id,
          type: 'segment',
          tripId: opts.tripId,
          stageId: stageId!,
          order: nextOrder(stageId!),
          name: track.name,
          notes: '',
          mode: opts.mode,
          geomType: 'imported',
          ...geometry,
        }),
      );
    }

    if (opts.areas) {
      for (const a of file.areas ?? []) {
        zoneCount++;
        changes.push(
          edits.create<Zone>({
            id: newId(),
            type: 'zone',
            tripId: opts.tripId,
            kind: opts.areas,
            polygon: a.polygon,
            name: a.name,
            reason: a.desc,
            severity: opts.areas === 'avoid' ? 'nogo' : 'caution',
            addedAt: Date.now(),
            source: file.name,
            ...(a.link ? { sourceUrl: a.link } : {}),
            dataDate: today,
          }),
        );
      }
    }

    if (!opts.waypoints) continue;
    for (const w of file.waypoints) {
      const existing = findExistingPoi(existingPois, w);
      if (existing) {
        poiMatched++;
        const links = [...new Set([...existing.links, ...w.links])];
        const notes = existing.notes || w.desc;
        if (links.length !== existing.links.length || notes !== existing.notes) {
          changes.push(edits.update<Poi>(store, existing.id, { links, notes }));
        }
        continue;
      }
      poiCount++;
      changes.push(
        edits.create<Poi>({
          id: newId(),
          type: 'poi',
          tripId: opts.tripId,
          lngLat: w.lngLat,
          category: 'other',
          name: w.name,
          notes: w.desc,
          links: w.links,
          status: 'idea',
          createdBy: opts.userId,
        }),
      );
    }
  }
  return { command: { label: opts.label, changes }, segmentIds, stageIds: newStages, poiCount, poiMatched, zoneCount };
}
