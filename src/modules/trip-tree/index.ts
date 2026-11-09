import { defineModule } from '../../core/module';
import StageCard from './StageCard.svelte';
import TripTree from './TripTree.svelte';

export default defineModule({
  id: 'trip-tree',
  setup(ctx) {
    const offSection = ctx.ui.addPanelSection({
      id: 'trip-tree',
      title: ctx.t('tree.title'),
      component: TripTree,
      props: { ctx },
      order: 10,
    });
    const offCard = ctx.ui.addCardRenderer('stage', { component: StageCard, props: { ctx } });
    return () => {
      offSection();
      offCard();
    };
  },
});
