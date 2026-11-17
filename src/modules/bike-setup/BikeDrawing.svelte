<script lang="ts">
  import { ANCHORS, PART_COLORS } from './look';
  import { isMounted, partDef, variantOf, type Load, type PartId, type Setup } from './setup';

  let {
    setup,
    loads,
    numbers,
    ghosts,
    hot,
    snapped,
    gearDragging,
    partDragging,
    label,
    alt,
    onGearDrop,
    onPartDrop,
    onHover,
  }: {
    setup: Setup;
    loads: Map<string, Load>;
    numbers: Map<PartId, number>;
    /** Parts shown as outlines, where they would go. */
    ghosts: PartId[];
    hot: PartId | null;
    /** The part that was just put on, for its snap animation. */
    snapped: PartId | null;
    gearDragging: boolean;
    partDragging: boolean;
    label: (part: PartId, carrier?: string) => string;
    alt: string;
    onGearDrop: (carrier: string) => void;
    onPartDrop: () => void;
    onHover: (part: PartId | null) => void;
  } = $props();

  const on = (id: PartId) => isMounted(setup, id) || ghosts.includes(id);
  const cls = (id: PartId) => ({ part: true, ghost: !isMounted(setup, id), hot: hot === id, snap: snapped === id, target: gearDragging && isMounted(setup, id) && partDef(id).carriers.length > 0 });
  const full = (carrier: string) => (loads.get(carrier)?.items.length ?? 0) > 0;
  const fill = (id: PartId) => PART_COLORS[id];

  function carrierAt(e: DragEvent): string | null {
    const el = (e.target as Element | null)?.closest?.('[data-carrier]');
    return el?.getAttribute('data-carrier') ?? null;
  }

  function over(e: DragEvent) {
    if (partDragging || (gearDragging && carrierAt(e))) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    }
  }

  function drop(e: DragEvent) {
    e.preventDefault();
    if (partDragging) return onPartDrop();
    const c = carrierAt(e);
    if (c) onGearDrop(c);
  }

  function hover(e: PointerEvent) {
    const el = (e.target as Element | null)?.closest?.('[data-part]');
    onHover((el?.getAttribute('data-part') as PartId | null) ?? null);
  }
</script>

<!--
  A 56 cm gravel bike to scale, drawn in millimetres: 700×40 wheels, 1030 mm wheelbase, 430 mm
  chainstays, 73.5° seat and 71.5° head angles, 580 mm stack and 385 mm reach. The group below
  maps millimetres to the view (half size, y up, rear axle at the origin).
-->
{#snippet cage(id: PartId, carrier: string, x: number, y: number, a: number, far = false)}
  <g class={cls(id)} data-part={id} data-carrier={carrier}>
    <title>{label(id, carrier)}</title>
    <g transform="translate({x} {y}) rotate({a})" class:far>
      <rect x="-125" y="-58" width="270" height="116" class="hit" />
      {#if id === 'cageFork'}
        {#if full(carrier)}<rect x="-110" y="-48" width="220" height="96" rx="36" fill={fill(id)} class="bottle" />{/if}
        <path d="M-100 -52 L-100 52 M-100 52 L100 52 M-100 -52 L100 -52 M0 -52 L0 52" class="cage" />
      {:else}
        {#if full(carrier)}
          <rect x="-115" y="-37" width="230" height="74" rx="28" fill={fill(id)} class="bottle" />
          <rect x="112" y="-19" width="26" height="38" rx="6" class="cap" />
        {/if}
        <path d="M-105 -42 L-105 42 M-105 42 L85 42 M-105 -42 L40 -42" class="cage" />
      {/if}
    </g>
  </g>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<svg
  viewBox="0 0 860 548"
  class="bike"
  class:dropping={partDragging}
  role="img"
  aria-label={alt}
  ondragover={over}
  ondrop={drop}
  onpointermove={hover}
  onpointerleave={() => onHover(null)}
>
  <defs>
    <pattern id="bike-hatch" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="16" stroke="currentColor" stroke-width="4" opacity="0.25" />
    </pattern>
  </defs>

  <ellipse cx="432" cy="531" rx="390" ry="8" class="shadow" />

  <g transform="matrix(0.5 0 0 -0.5 130 354)">
    <!-- Far side: left panniers and fork cage, behind the wheels. -->
    {#if on('rearPanniers')}
      <g class={cls('rearPanniers')} data-part="rearPanniers" data-carrier="rearPannierL">
        <title>{label('rearPanniers', 'rearPannierL')}</title>
        <rect x="-148" y="-20" width="330" height="425" rx="30" fill={fill('rearPanniers')} class="far" />
      </g>
    {/if}
    {#if on('frontPanniers')}
      <g class={cls('frontPanniers')} data-part="frontPanniers" data-carrier="frontPannierL">
        <title>{label('frontPanniers', 'frontPannierL')}</title>
        <rect x="925" y="58" width="255" height="290" rx="28" fill={fill('frontPanniers')} class="far" />
      </g>
    {/if}
    {#if on('cageFork')}{@render cage('cageFork', 'cageForkL', 979, 257, -71.5, true)}{/if}

    <!-- Wheels -->
    {#each [0, 1030] as cx (cx)}
      <g class="wheel">
        <circle {cx} cy="0" r="331" class="tire" />
        <circle {cx} cy="0" r="305" class="rim" />
        {#each Array.from({ length: 24 }, (_, i) => (i * Math.PI) / 12) as a (a)}
          <line x1={cx + Math.cos(a) * 20} y1={Math.sin(a) * 20} x2={cx + Math.cos(a + 0.35) * 300} y2={Math.sin(a + 0.35) * 300} class="spoke" />
        {/each}
        <circle {cx} cy="0" r="22" class="hub" />
      </g>
    {/each}

    <!-- Drivetrain -->
    <line x1="424" y1="12" x2="0" y2="45" class="chain" />
    <line x1="424" y1="-152" x2="0" y2="-45" class="chain" />
    <circle cx="0" cy="0" r="45" class="cog" />

    <!-- Frame -->
    <g class="frame">
      <line x1="424" y1="-70" x2="0" y2="0" class="stay" />
      <line x1="260" y1="430" x2="0" y2="0" class="stay" />
      <line x1="424" y1="-70" x2="271" y2="448" />
      <line x1="271" y1="448" x2="816" y2="489" />
      <line x1="424" y1="-70" x2="854" y2="377" class="down" />
      <line x1="809" y1="510" x2="860" y2="358" class="head" />
      <path d="M860 358 L952 83 Q968 22 1030 0" class="fork" />
    </g>
    <circle cx="424" cy="-70" r="82" class="ring" />
    <line x1="424" y1="-70" x2="510" y2="-219" class="crank" />
    <rect x="482" y="-232" width="60" height="18" rx="5" class="pedal" />

    <!-- Racks -->
    {#if on('rearRack')}
      <g class={cls('rearRack')} data-part="rearRack">
        <title>{label('rearRack')}</title>
        <g class="rack">
          <line x1="-170" y1="395" x2="235" y2="395" class="deck" />
          <line x1="230" y1="395" x2="244" y2="402" />
          <line x1="-150" y1="392" x2="-6" y2="8" />
          <line x1="150" y1="392" x2="6" y2="8" />
          <line x1="-77" y1="200" x2="77" y2="200" />
        </g>
      </g>
    {/if}
    {#if on('frontRack')}
      <g class={cls('frontRack')} data-part="frontRack">
        <title>{label('frontRack')}</title>
        <g class="rack">
          <line x1="880" y1="400" x2="1200" y2="400" class="deck" />
          <line x1="885" y1="398" x2="866" y2="362" />
          <line x1="1000" y1="398" x2="1026" y2="10" />
          <line x1="1180" y1="398" x2="1038" y2="8" />
        </g>
      </g>
    {/if}

    <!-- In the frame -->
    {#if on('frameBag')}
      <g class={cls('frameBag')} data-part="frameBag" data-carrier="frameBag">
        <title>{label('frameBag', 'frameBag')}</title>
        <polygon
          points={variantOf(setup, 'frameBag') === 'full' ? '324,410 790,445 790,377 441,14' : '324,410 790,445 790,377 684,267 373,243'}
          fill={fill('frameBag')}
          stroke={fill('frameBag')}
          class="bag soft"
        />
        <line x1="345" y1="392" x2="772" y2="425" class="zip" />
      </g>
    {/if}
    {#if on('cageDown')}{@render cage('cageDown', 'cageDown', 581, 183, 46.2)}{/if}
    {#if on('cageUnder')}{@render cage('cageUnder', 'cageUnder', 611, 35, 46.2)}{/if}
    {#if on('cageSeat')}{@render cage('cageSeat', 'cageSeat', 411, 185, 106.5)}{/if}
    {#if on('topTubeBag')}
      <g class={cls('topTubeBag')} data-part="topTubeBag" data-carrier="topTubeBag">
        <title>{label('topTubeBag', 'topTubeBag')}</title>
        <polygon points="614,492 792,505 792,560 622,548" fill={fill('topTubeBag')} stroke={fill('topTubeBag')} class="bag soft" />
      </g>
    {/if}

    <!-- Seat -->
    <line x1="271" y1="448" x2="223" y2="611" class="post" />
    <path d="M95 640 Q120 656 220 650 Q330 646 366 636 Q370 627 355 625 Q260 621 150 617 Q100 617 95 640 Z" class="saddle" />
    {#if on('seatPack')}
      <g class={cls('seatPack')} data-part="seatPack" data-carrier="seatPack">
        <title>{label('seatPack', 'seatPack')}</title>
        <path d="M215 602 L210 470 Q110 468 0 520 Q-46 546 -20 582 Q90 612 215 602 Z" fill={fill('seatPack')} class="bag" />
        <line x1="112" y1="478" x2="115" y2="604" class="strap" />
      </g>
    {/if}

    <!-- On the rear rack, and the near (right) rear pannier -->
    {#if on('rearTop')}
      <g class={cls('rearTop')} data-part="rearTop" data-carrier="rearTop">
        <title>{label('rearTop', 'rearTop')}</title>
        {#if variantOf(setup, 'rearTop') === 'open'}
          <rect x="-160" y="402" width="380" height="72" rx="12" class="open" />
          <line x1="-60" y1="396" x2="-60" y2="480" class="strap" />
          <line x1="120" y1="396" x2="120" y2="480" class="strap" />
        {:else}
          <rect x="-160" y="402" width="380" height="100" rx="20" fill={fill('rearTop')} class="bag" />
          <line x1="-138" y1="472" x2="198" y2="472" class="zip" />
        {/if}
      </g>
    {/if}
    {#if on('rearPanniers')}
      <g class={cls('rearPanniers')} data-part="rearPanniers" data-carrier="rearPannierR">
        <title>{label('rearPanniers', 'rearPannierR')}</title>
        <rect x="-178" y="-40" width="330" height="425" rx="30" fill={fill('rearPanniers')} class="bag" />
        <rect x="-178" y="330" width="330" height="55" rx="20" class="roll" />
        <line x1="-13" y1="330" x2="-13" y2="230" class="strap" />
        <rect x="-27" y="214" width="28" height="22" rx="4" class="buckle" />
      </g>
    {/if}

    <!-- Cockpit -->
    <line x1="809" y1="510" x2="800" y2="537" class="spacer" />
    <line x1="800" y1="537" x2="905" y2="555" class="stem" />
    <path d="M905 555 L955 557 Q992 556 990 505 Q988 445 940 442 L922 446" class="bar" />
    <path d="M950 560 L978 592 L992 585" class="hood" />

    {#if on('frontTop')}
      <g class={cls('frontTop')} data-part="frontTop" data-carrier="frontTop">
        <title>{label('frontTop', 'frontTop')}</title>
        {#if variantOf(setup, 'frontTop') === 'open'}
          <rect x="885" y="407" width="315" height="70" rx="12" class="open" />
          <line x1="960" y1="400" x2="960" y2="482" class="strap" />
          <line x1="1125" y1="400" x2="1125" y2="482" class="strap" />
        {:else}
          <rect x="885" y="407" width="315" height="95" rx="20" fill={fill('frontTop')} class="bag" />
          <line x1="905" y1="472" x2="1180" y2="472" class="zip" />
        {/if}
      </g>
    {/if}
    {#if on('handlebarBag')}
      <g class={cls('handlebarBag')} data-part="handlebarBag" data-carrier="handlebarBag">
        <title>{label('handlebarBag', 'handlebarBag')}</title>
        <circle cx="1050" cy="500" r="92" fill={fill('handlebarBag')} class="bag" />
        <circle cx="1050" cy="500" r="40" class="roll-end" />
      </g>
    {/if}
    {#if on('frontPanniers')}
      <g class={cls('frontPanniers')} data-part="frontPanniers" data-carrier="frontPannierR">
        <title>{label('frontPanniers', 'frontPannierR')}</title>
        <rect x="900" y="40" width="255" height="290" rx="28" fill={fill('frontPanniers')} class="bag" />
        <rect x="900" y="285" width="255" height="45" rx="18" class="roll" />
      </g>
    {/if}
    {#if on('cageFork')}{@render cage('cageFork', 'cageForkR', 961, 239, -71.5)}{/if}
  </g>

  <!-- Numbers matching the cards -->
  {#each [...numbers] as [id, n] (id)}
    {@const at = ANCHORS[id]}
    {#if at && isMounted(setup, id)}
      <g class="badge" class:hot={hot === id} transform="translate({at[0]} {at[1]})" pointer-events="none">
        <circle r="11" fill={fill(id)} />
        <text dy="4">{n}</text>
      </g>
    {/if}
  {/each}
</svg>

<style>
  .bike {
    width: 100%;
    height: auto;
    display: block;
    color: var(--fg);
    --tire: #2b2b30;
    --metal: #868e96;
    --frame: #3f7d6e;
    overflow: visible;
  }

  :global(:root[data-theme='dark']) .bike {
    --tire: #8b8b94;
    --metal: #a5adb5;
    --frame: #5fae9a;
  }

  .shadow {
    fill: var(--fg);
    opacity: 0.08;
  }

  /* Sizes below are in millimetres, drawn at half size. */
  .tire {
    fill: none;
    stroke: var(--tire);
    stroke-width: 40;
  }

  .rim {
    fill: none;
    stroke: var(--metal);
    stroke-width: 7;
  }

  .spoke {
    stroke: var(--metal);
    stroke-width: 2.5;
    opacity: 0.6;
  }

  .hub,
  .cog {
    fill: var(--bg);
    stroke: var(--metal);
    stroke-width: 7;
  }

  .chain {
    stroke: var(--metal);
    stroke-width: 6;
    stroke-dasharray: 7 4;
  }

  .frame line,
  .frame path {
    stroke: var(--frame);
    stroke-width: 30;
    stroke-linecap: round;
    fill: none;
  }

  .frame .stay {
    stroke-width: 18;
  }

  .frame .down {
    stroke-width: 38;
  }

  .frame .head {
    stroke-width: 46;
  }

  .frame .fork {
    stroke-width: 26;
  }

  .ring {
    fill: none;
    stroke: var(--tire);
    stroke-width: 10;
  }

  .crank,
  .post,
  .stem,
  .spacer {
    stroke: var(--tire);
    stroke-width: 26;
    stroke-linecap: round;
  }

  .spacer {
    stroke-width: 34;
    stroke-linecap: butt;
  }

  .pedal,
  .saddle {
    fill: var(--tire);
  }

  .bar,
  .hood {
    fill: none;
    stroke: var(--tire);
    stroke-width: 22;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .rack line {
    stroke: var(--metal);
    stroke-width: 10;
    stroke-linecap: round;
  }

  .rack .deck {
    stroke-width: 14;
  }

  .bag {
    stroke: rgb(0 0 0 / 0.25);
    stroke-width: 3;
  }

  .bag.soft {
    stroke-width: 22;
    stroke-linejoin: round;
  }

  .far {
    filter: brightness(0.62);
    stroke: rgb(0 0 0 / 0.25);
  }

  .roll {
    fill: rgb(0 0 0 / 0.18);
  }

  .roll-end {
    fill: rgb(0 0 0 / 0.15);
  }

  .zip,
  .strap {
    stroke: rgb(0 0 0 / 0.35);
    stroke-width: 6;
    stroke-linecap: round;
  }

  .strap {
    stroke: var(--tire);
    stroke-width: 10;
  }

  .buckle {
    fill: var(--tire);
  }

  .open {
    fill: url(#bike-hatch);
    stroke: var(--fg-muted);
    stroke-width: 5;
    stroke-dasharray: 14 9;
  }

  .cage {
    fill: none;
    stroke: var(--metal);
    stroke-width: 8;
    stroke-linecap: round;
  }

  .bottle {
    stroke: rgb(0 0 0 / 0.25);
    stroke-width: 3;
  }

  .cap {
    fill: var(--tire);
  }

  .hit {
    fill: transparent;
  }

  .part {
    cursor: default;
    transition: filter 0.15s;
  }

  .part[data-carrier] {
    cursor: copy;
  }

  .part.ghost {
    opacity: 0.35;
    pointer-events: none;
  }

  .part.ghost :global(*) {
    stroke-dasharray: 12 9;
  }

  .part.hot {
    filter: drop-shadow(0 0 6px var(--accent));
  }

  .part.target[data-carrier] {
    animation: pulse 1.2s ease-in-out infinite;
  }

  .part.snap {
    transform-box: fill-box;
    transform-origin: center;
    animation: snap 0.35s cubic-bezier(0.2, 1.4, 0.5, 1);
  }

  .dropping .wheel,
  .dropping .frame {
    opacity: 0.85;
  }

  .badge text {
    fill: #fff;
    font-size: 12px;
    font-weight: 700;
    text-anchor: middle;
  }

  .badge circle {
    stroke: #fff;
    stroke-width: 2;
  }

  .badge.hot circle {
    stroke: var(--accent);
    stroke-width: 3;
  }

  /* Inside the drawing y points up, so a positive shift starts the part above its place. */
  @keyframes snap {
    from {
      transform: translateY(36px) scale(1.06);
      opacity: 0.4;
    }
  }

  @keyframes pulse {
    50% {
      filter: drop-shadow(0 0 7px var(--accent));
    }
  }
</style>
