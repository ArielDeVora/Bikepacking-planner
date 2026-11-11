import { defineModule } from '../../core/module';
import OfflineBadge from './OfflineBadge.svelte';
import OfflineCard from './OfflineCard.svelte';

export default defineModule({
  id: 'offline',
  setup(ctx) {
    const removers = [
      ctx.ui.addCardSection({ id: 'offline.map', component: OfflineCard, props: { ctx }, types: ['route', 'stage', 'group', 'segment'], order: 90 }),
      ctx.ui.addWidget({ id: 'offline.badge', component: OfflineBadge, props: { t: ctx.t }, position: 'top', order: 1 }),
    ];
    return () => removers.forEach((off) => off());
  },
});
