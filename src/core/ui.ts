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
}

/** A small floating element over the map, e.g. a legend. Stacked bottom-left. */
export interface WidgetSpec {
  id: string;
  component: AnyComponent;
  props?: Record<string, unknown>;
  order?: number;
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

export class UiRegistry {
  readonly tools = registry<ToolSpec>();
  readonly panelSections = registry<PanelSectionSpec>();
  readonly widgets = registry<WidgetSpec>();

  #cards = writable(new Map<string, CardRenderer>());
  readonly cards: Readable<Map<string, CardRenderer>> = { subscribe: this.#cards.subscribe };

  #toasts = writable<Toast[]>([]);
  readonly toasts: Readable<Toast[]> = { subscribe: this.#toasts.subscribe };
  #toastId = 0;

  addTool(spec: ToolSpec) {
    return this.tools.add(spec);
  }

  addPanelSection(spec: PanelSectionSpec) {
    return this.panelSections.add(spec);
  }

  addWidget(spec: WidgetSpec) {
    return this.widgets.add(spec);
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

  notify(message: string, kind: Toast['kind'] = 'info', ms = 5000): void {
    const id = ++this.#toastId;
    this.#toasts.update((list) => [...list, { id, message, kind }]);
    if (ms > 0) setTimeout(() => this.dismiss(id), ms);
  }

  dismiss(id: number): void {
    this.#toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
