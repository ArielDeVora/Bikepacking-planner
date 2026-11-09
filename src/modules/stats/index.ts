import { defineModule } from '../../core/module';
import StageStats from './StageStats.svelte';
import TripStats from './TripStats.svelte';

export default defineModule({
  id: 'stats',
  setup(ctx) {
    const removeSection = ctx.ui.addPanelSection({
      id: 'stats',
      title: ctx.t('stats.title'),
      component: TripStats,
      props: { ctx },
      order: 20,
    });
    const removeCard = ctx.ui.addCardSection({ id: 'stats.stage', component: StageStats, props: { ctx }, types: ['stage', 'group'], order: 3 });
    return () => {
      removeSection();
      removeCard();
    };
  },
});
