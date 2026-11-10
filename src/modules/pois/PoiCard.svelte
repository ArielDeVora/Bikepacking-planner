<script lang="ts">
  import { POI_CATEGORIES, POI_CATEGORY_ORDER, POI_STATUS_ORDER } from '../../config/pois';
  import { edits } from '../../core/commands';
  import type { ModuleContext } from '../../core/module';
  import { icons } from '../../lib/icons';
  import { authorOf } from '../../lib/places/authors';
  import { createFolderCommand, folderOf, moveToFolderCommand, sortedFolders } from '../../lib/places/folders';
  import { tally, voteCommand, VOTES } from '../../lib/places/votes';
  import PlaceInfo from '../../lib/places/PlaceInfo.svelte';
  import Icon from '../../lib/ui/Icon.svelte';
  import IconButton from '../../lib/ui/IconButton.svelte';
  import type { Poi, PoiCategory, PoiStatus, VoteValue } from '../../model/types';

  let { id, ctx }: { id: string; ctx: ModuleContext } = $props();
  const { t, commands } = $derived(ctx);
  const store = $derived(ctx.store);

  const poi = $derived.by(() => {
    void $store;
    return store.get(id, 'poi');
  });

  const shared = $derived(ctx.cloud.shared);
  const members = $derived(ctx.cloud.members);
  const author = $derived.by(() => {
    void $members;
    return poi ? authorOf(ctx.cloud, t, poi.createdBy) : null;
  });

  const folders = $derived.by(() => {
    void $store;
    return sortedFolders(store);
  });
  const folderId = $derived.by(() => {
    void $store;
    return poi ? (folderOf(store, poi)?.id ?? '') : '';
  });
  const NEW_FOLDER = '__new';

  // Votes: everyone's opinion, yours highlighted; clicking yours again takes it back.
  const votes = $derived.by(() => {
    void $store;
    return store.list('vote', (v) => v.poiId === id && v.value !== 0);
  });
  const myVote = $derived(votes.find((v) => v.userId === ctx.user.id)?.value ?? votes.find((v) => ctx.cloud.isMine(v.userId))?.value ?? 0);
  const counts = $derived(tally(votes).counts);
  const voters = $derived.by(() => {
    void $members;
    const emoji = (value: VoteValue) => VOTES.find((o) => o.value === value)?.emoji ?? '';
    return votes
      .map((v) => ({ id: v.id, value: v.value, emoji: emoji(v.value), who: authorOf(ctx.cloud, t, v.userId) }))
      .sort((a, b) => b.value - a.value || a.who.name.localeCompare(b.who.name));
  });

  function vote(value: VoteValue) {
    const cmd = voteCommand(store, {
      tripId: ctx.tripId,
      poiId: id,
      userId: ctx.user.id,
      value: myVote === value ? 0 : value,
      label: t('cmd.vote'),
      isMine: ctx.cloud.isMine,
    });
    if (cmd) commands.run(cmd);
  }

  function pickFolder(value: string) {
    if (value === NEW_FOLDER) {
      const { command } = createFolderCommand(store, {
        tripId: ctx.tripId,
        name: t('folder.defaultName', { n: folders.length + 1 }),
        label: t('cmd.addFolder'),
        poiIds: [id],
      });
      commands.run(command);
      return;
    }
    const cmd = moveToFolderCommand(store, [id], value || null, t('cmd.moveToFolder'));
    if (cmd) commands.run(cmd);
  }

  let newLink = $state('');

  function patch(p: Partial<Poi>, field?: string) {
    commands.run({
      label: t('cmd.editPoi'),
      changes: [edits.update<Poi>(store, id, p)],
      ...(field ? { mergeKey: `poi:${id}:${field}` } : {}),
    });
  }

  function addLink(e: SubmitEvent) {
    e.preventDefault();
    const url = newLink.trim();
    if (!poi || !url) return;
    patch({ links: [...poi.links, /^https?:\/\//.test(url) ? url : `https://${url}`] });
    newLink = '';
  }

  const host = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  };
</script>

{#if poi}
  {#if $shared && author}
    <p class="added">
      <span class="dot" style:background={author.color}></span>
      {t('poi.addedBy', { name: author.key === 'me' ? t('collab.you') : author.name })}
    </p>
  {/if}

  <label class="field">
    <span>{t('poi.name')}</span>
    <input type="text" value={poi.name} oninput={(e) => patch({ name: e.currentTarget.value }, 'name')} onblur={() => commands.seal()} />
  </label>

  <div class="field">
    <span>{t('poi.category')}</span>
    <div class="cats" role="radiogroup" aria-label={t('poi.category')}>
      {#each POI_CATEGORY_ORDER as cat (cat)}
        <button
          type="button"
          class="cat"
          class:active={poi.category === cat}
          style:--c={POI_CATEGORIES[cat].color}
          title={t(`poi.cat.${cat}`)}
          aria-label={t(`poi.cat.${cat}`)}
          onclick={() => patch({ category: cat as PoiCategory })}
        >
          <Icon d={POI_CATEGORIES[cat].icon} size={15} />
        </button>
      {/each}
    </div>
  </div>

  <div class="field">
    <span>{t('poi.status')}</span>
    <div class="status" role="radiogroup" aria-label={t('poi.status')}>
      {#each POI_STATUS_ORDER as s (s)}
        <button type="button" class={s} class:active={poi.status === s} onclick={() => patch({ status: s as PoiStatus })}>{t(`poi.status.${s}`)}</button>
      {/each}
    </div>
  </div>

  <div class="field">
    <span>{t('vote.title')}</span>
    <div class="votes" role="group" aria-label={t('vote.title')}>
      {#each VOTES as o (o.value)}
        <button
          type="button"
          class="vote"
          class:mine={myVote === o.value}
          aria-pressed={myVote === o.value}
          title={myVote === o.value ? t('vote.take') : t(o.key)}
          onclick={() => vote(o.value)}
        >
          <span class="emoji" aria-hidden="true">{o.emoji}</span>
          <span>{t(o.key)}</span>
          {#if counts[o.value]}<span class="n">{counts[o.value]}</span>{/if}
        </button>
      {/each}
    </div>
    {#if voters.length}
      <ul class="voters">
        {#each voters as v (v.id)}
          <li title={t(VOTES.find((o) => o.value === v.value)!.key)}>
            <span class="dot" style:background={v.who.color}></span>
            {v.who.name}
            <span aria-hidden="true">{v.emoji}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <label class="field">
    <span>{t('folder.label')}</span>
    <select value={folderId} onchange={(e) => pickFolder(e.currentTarget.value)}>
      <option value="">{t('folder.none')}</option>
      {#each folders as f (f.id)}
        <option value={f.id}>{f.name || t('poi.untitled')}</option>
      {/each}
      <option value={NEW_FOLDER}>{t('folder.newFrom')}</option>
    </select>
  </label>

  <label class="field">
    <span>{t('poi.notes')}</span>
    <textarea value={poi.notes} oninput={(e) => patch({ notes: e.currentTarget.value }, 'notes')} onblur={() => commands.seal()}></textarea>
  </label>

  <div class="field">
    <span>{t('poi.links')}</span>
    <ul class="linklist">
      {#each poi.links as link, i (link + i)}
        <li>
          <a href={link} target="_blank" rel="noopener noreferrer">{host(link)}</a>
          <IconButton icon={icons.close} label={t('poi.removeLink')} size={12} onclick={() => patch({ links: poi.links.filter((_, j) => j !== i) })} />
        </li>
      {/each}
    </ul>
    <form class="addlink" onsubmit={addLink}>
      <input type="url" placeholder={t('poi.addLink')} bind:value={newLink} />
    </form>
  </div>

  <PlaceInfo {ctx} lngLat={poi.lngLat} name={poi.name} osm={poi.osm} />

  <p class="hint muted">{t('poi.dragHint')}</p>
  <button type="button" class="danger" onclick={() => commands.run({ label: t('cmd.deletePoi'), changes: [edits.remove(store, id)] })}>
    {t('poi.delete')}
  </button>
{/if}

<style>
  .votes {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .vote {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 9px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .vote:hover {
    background: var(--bg-hover);
  }

  .vote.mine {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }

  .emoji {
    font-size: 14px;
    line-height: 1;
  }

  .n {
    min-width: 16px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--bg-sunken);
    color: var(--fg);
    font-size: 11px;
    font-weight: 600;
    text-align: center;
  }

  .voters {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    margin: 6px 0 0;
    padding: 0;
    list-style: none;
    font-size: 12px;
    color: var(--fg-muted);
  }

  .voters li {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .added {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 8px;
    font-size: 12px;
    color: var(--fg-muted);
  }

  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }

  .cats {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .cat {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 1.5px solid var(--c);
    border-radius: 50%;
    background: var(--bg);
    color: var(--c);
    cursor: pointer;
  }

  .cat.active {
    background: var(--c);
    color: #fff;
  }

  .status {
    display: flex;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .status button {
    flex: 1;
    padding: 4px 2px;
    border: 0;
    background: var(--bg);
    font-size: 12px;
    cursor: pointer;
  }

  .status button + button {
    border-left: 1px solid var(--border);
  }

  .status button.active {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .status button.goated {
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  .status button.goated.active {
    background: linear-gradient(90deg, #fcc419, #f59f00);
    color: #3b2700;
  }

  .linklist {
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 13px;
  }

  .linklist li {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .linklist a {
    color: var(--accent);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .addlink input {
    width: 100%;
    padding: 5px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
  }

  .hint {
    font-size: 12px;
  }

  .danger {
    padding: 5px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--danger);
    cursor: pointer;
  }
</style>
