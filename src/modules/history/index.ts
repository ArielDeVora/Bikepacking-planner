import { get, writable } from 'svelte/store';
import { KEYS } from '../../config/shortcuts';
import { defineModule } from '../../core/module';
import { icons } from '../../lib/icons';
import type { Comment } from '../../model/types';
import HistoryDialog from './HistoryDialog.svelte';
import ItemHistory from './ItemHistory.svelte';
import SinceCard from './SinceCard.svelte';
import { isEmpty, sinceLastVisit, type SinceSummary } from './since';

const MENTION_TOAST_MS = 12_000;

export default defineModule({
  id: 'history',
  setup(ctx) {
    const { ui, t, cloud, settings, store } = ctx;
    const open = (focus: string | null = null) => ui.openDialog(HistoryDialog, { ctx, focus });

    // Since your last visit: what others did on the shared trip, shown once it has synced.
    const seenKey = () => `seen:${ctx.tripId}`;
    const summary = writable<{ since: number; data: SinceSummary } | null>(null);
    let checked = false;
    const offStatus = cloud.status.subscribe((s) => {
      if (checked || s !== 'synced' || !get(cloud.shared)) return;
      checked = true;
      const since = settings.get<number | null>(seenKey(), null);
      settings.set(seenKey(), Date.now());
      if (since === null) return;
      const data = sinceLastVisit(store.all(), since, cloud.isMine);
      if (!isEmpty(data)) summary.set({ since, data });
    });
    const markSeen = () => {
      if (checked && document.visibilityState === 'hidden') settings.set(seenKey(), Date.now());
    };
    document.addEventListener('visibilitychange', markSeen);

    // Mentioned while the trip is open: a notice with a link to the comment.
    const startedAt = Date.now();
    const notified = new Set<string>();
    const offMentions = store.onChange(({ ids, origin }) => {
      if (origin !== 'remote') return;
      for (const id of ids) {
        const c = store.getRaw(id);
        if (c?.type !== 'comment' || c.deleted || notified.has(id)) continue;
        const comment = c as Comment;
        if (comment.createdAt < startedAt || cloud.isMine(comment.authorId) || !comment.mentions?.some(cloud.isMine)) continue;
        notified.add(id);
        const name = cloud.profileOf(comment.authorId)?.name || t('collab.someone');
        ui.notify(t('since.mentionedToast', { name, text: comment.body.slice(0, 80) }), 'info', MENTION_TOAST_MS, {
          label: t('since.show'),
          run: () => ctx.selection.set([comment.targetId]),
        });
      }
    });

    const removers = [
      ui.addTool({ id: 'history', label: t('history.title'), icon: icons.history, shortcut: KEYS.history, order: 70, run: () => open() }),
      ctx.shortcuts.add({ keys: KEYS.history, label: t('history.title'), run: () => open() }),
      ui.addCardSection({ id: 'history.item', component: ItemHistory, props: { ctx, open }, order: 11 }),
      ui.addWidget({
        id: 'history.since',
        component: SinceCard,
        props: {
          ctx,
          summary,
          openHistory: () => {
            summary.set(null);
            open();
          },
          close: () => summary.set(null),
        },
        order: 5,
      }),
      offStatus,
      offMentions,
      () => document.removeEventListener('visibilitychange', markSeen),
    ];
    return () => removers.forEach((off) => off());
  },
});
