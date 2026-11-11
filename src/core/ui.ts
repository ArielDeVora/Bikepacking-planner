import type { Component } from 'svelte';
import { writable, type Readable } from 'svelte/store';

export interface ToolSpec {
  id: string;
  label: string;
  /** SVG path data on a 24×24 grid, stroked. */
  icon: string;
  order?: number;
  shortcut?: string;
  active?: Readable<boolean>;
  disabled?: Readable<boolean>;
  /** Clicking other segments while it's on doesn't select them (the tool uses those clicks). */
  keepSelection?: boolean;
  /** Changes nothing in the trip, so it stays available in a read-only view. */
  viewOnly?: boolean;
  run: () => void;
}

// Registered components are rendered with arbitrary props supplied by their module.
type AnyComponent = Component<any>;

export interface PanelSectionSpec {
  id: string;
  title: string;
  component: AnyComponent;
  props?: Record<string, unknown>;
  order?: number;
  /** In the side panel's list (default), or in the map pane that drops down from its header. */
  placement?: 'list' | 'pane';
}

/** A small floating element over the map, e.g. a legend. Stacked bottom-left. */
export interface WidgetSpec {
  id: string;
  component: AnyComponent;
  props?: Record<string, unknown>;
  order?: number;
  /** Bottom-left stack (default), or centred along the top of the map. */
  position?: 'bottom' | 'top';
}

/** Renders the info card for a selected entity. The component receives `id` plus `props`. */
export interface CardRenderer {
  component: AnyComponent;
  props?: Record<string, unknown>;
}

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'warn' | 'error';
  action?: { label: string; run: () => void };
}

/** Extra content shown under the info card of the listed entity types (all types if omitted). */
export interface CardSectionSpec {
  id: string;
  component: AnyComponent;
  props?: Record<string, unknown>;
  types?: string[];
  order?: number;
}

function registry<T extends { id: string; order?: number }>() {
  const items = writable<T[]>([]);
  return {
    subscribe: items.subscribe,
    add(item: T): () => void {
      items.update((list) =>
        [...list.filter((i) => i.id !== item.id), item].sort((a, b) => (a.order ?? 100) - (b.order ?? 100)),
      );
      return () => items.update((list) => list.filter((i) => i !== item));
    },
  };
}

/** A full-screen page of the app (e.g. planning), opened from the panel header or its address (#id). */
export interface ViewSpec {
  id: string;
  label: string;
  icon: string;
  component: AnyComponent;
  props?: Record<string, unknown>;
  order?: number;
}

export class UiRegistry {
  readonly tools = registry<ToolSpec>();
  readonly views = registry<ViewSpec>();
  readonly panelSections = registry<PanelSectionSpec>();
  readonly widgets = registry<WidgetSpec>();
  readonly cardSections = registry<CardSectionSpec>();
  /** Shown in the info card when several entities are selected; the component receives `ids`. */
  readonly multiCards = registry<WidgetSpec>();
  /** Full-width panels along the bottom of the map (e.g. the elevation profile). */
  readonly drawers = registry<WidgetSpec>();

  #cards = writable(new Map<string, CardRenderer>());
  readonly cards: Readable<Map<string, CardRenderer>> = { subscribe: this.#cards.subscribe };

  #pointLayers = new Set<string>();

  /**
   * Registers a layer of clickable markers (places, crossings…). Lines and areas underneath, such
   * as routes, leave clicks on these markers to their module.
   */
  addPointLayer(id: string): () => void {
    this.#pointLayers.add(id);
    return () => this.#pointLayers.delete(id);
  }

  get pointLayers(): string[] {
    return [...this.#pointLayers];
  }

  #claimed = new WeakSet<Event>();

  /**
   * Marks a map click as handled, so handlers for things underneath (e.g. a zone around the
   * clicked segment) leave it alone. Pass the DOM event (`e.originalEvent`).
   */
  claim(e: Event): void {
    this.#claimed.add(e);
  }

  claimed(e: Event): boolean {
    return this.#claimed.has(e);
  }

  #tool = writable<string | null>(null);
  /** The active map tool (drawing, splitting…). One at a time; null when none is. */
  readonly tool: Readable<string | null> = { subscribe: this.#tool.subscribe };

  setTool(id: string | null): void {
    this.#tool.set(id);
  }

  toggleTool(id: string): void {
    this.#tool.update((current) => (current === id ? null : id));
  }

  #place = writable<{ component: AnyComponent; props: Record<string, unknown> } | null>(null);
  /** A card about something that isn't a trip entity (a search result, an OSM feature). */
  readonly place: Readable<{ component: AnyComponent; props: Record<string, unknown> } | null> = { subscribe: this.#place.subscribe };

  showPlace(component: AnyComponent, props: Record<string, unknown> = {}): void {
    this.#place.set({ component, props });
  }

  closePlace(): void {
    this.#place.set(null);
  }

  #dialog = writable<{ component: AnyComponent; props: Record<string, unknown> } | null>(null);
  /** The open modal dialog, if any. */
  readonly dialog: Readable<{ component: AnyComponent; props: Record<string, unknown> } | null> = { subscribe: this.#dialog.subscribe };

  #toasts = writable<Toast[]>([]);
  readonly toasts: Readable<Toast[]> = { subscribe: this.#toasts.subscribe };
  #toastId = 0;

  /** A read-only view of someone's trip (a follow link): tools that edit are left out. */
  readOnly = false;

  addTool(spec: ToolSpec) {
    if (this.readOnly && !spec.viewOnly) return () => {};
    return this.tools.add(spec);
  }

  addPanelSection(spec: PanelSectionSpec) {
    return this.panelSections.add(spec);
  }

  addView(spec: ViewSpec) {
    return this.views.add(spec);
  }

  addWidget(spec: WidgetSpec) {
    return this.widgets.add(spec);
  }

  addDrawer(spec: WidgetSpec) {
    return this.drawers.add(spec);
  }

  addMultiCard(spec: WidgetSpec) {
    return this.multiCards.add(spec);
  }

  addCardSection(spec: CardSectionSpec) {
    return this.cardSections.add(spec);
  }

  addCardRenderer(entityType: string, renderer: CardRenderer): () => void {
    this.#cards.update((m) => new Map(m).set(entityType, renderer));
    return () =>
      this.#cards.update((m) => {
        const next = new Map(m);
        if (next.get(entityType) === renderer) next.delete(entityType);
        return next;
      });
  }

  openDialog(component: AnyComponent, props: Record<string, unknown> = {}): void {
    this.#dialog.set({ component, props });
  }

  /** Closes once the current event handler has finished, so the dialog can still use its props. */
  closeDialog(component?: AnyComponent): void {
    queueMicrotask(() => this.#dialog.update((d) => (!component || d?.component === component ? null : d)));
  }

  notify(message: string, kind: Toast['kind'] = 'info', ms = 5000, action?: Toast['action']): void {
    const id = ++this.#toastId;
    this.#toasts.update((list) => [...list, { id, message, kind, action }]);
    if (ms > 0) setTimeout(() => this.dismiss(id), ms);
  }

  dismiss(id: number): void {
    this.#toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
