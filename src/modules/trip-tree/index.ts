import { defineModule } from '../../core/module';
import GroupCard from './GroupCard.svelte';
import RouteCard from './RouteCard.svelte';
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
    const offGroupCard = ctx.ui.addCardRenderer('group', { component: GroupCard, props: { ctx } });
    const offRouteCard = ctx.ui.addCardRenderer('route', { component: RouteCard, props: { ctx } });
    return () => {
      offSection();
      offCard();
      offGroupCard();
      offRouteCard();
    };
  },
});
