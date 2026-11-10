# Climate: usual temperature and rain by week

Two overlays in the map pane (`Cmd+O`) show what the weather is usually like at any time of year: **Temperature (usual, by week)** and **Rain (usual, by week)**. They're for planning around monsoons, rainy seasons, heat and cold, not forecasts.

## Using it

- Switch on one of the overlays (one at a time: switching one on switches the other off). A bar appears at the top of the map:
  - a **slider** for the week of the year (it starts at the current week), with the months underneath;
  - **play** to run through the year week by week (watch the monsoon move);
  - for temperature, **Daytime highs** or **Night lows**;
  - the colour scale (°C, or mm of rain per month).
- **Click the map** (outside routes and places) for **Usual weather here**: a chart of that place's year (rain bars, daytime highs and night lows), the selected week marked, its values, and the wettest month.
- **Stage, group and segment cards** show the usual weather at the middle of the item for its planned date (a segment or group without a date uses its stage's), with **Show that week on the map**.

## The data

[TerraClimate](https://www.climatologylab.org/terraclimate.html) 1991–2020 monthly averages (Climatology Lab, UC Merced; Abatzoglou et al. 2018, doi:10.1038/sdata.2017.191). Public domain (CC0): average daily maximum and minimum temperature, and monthly precipitation, for land.

- Kept at 1/4° (about 28 km), every 6th cell of the 1/24° original. Downloaded once by `npm run climate` (`scripts/fetch-climate.mjs`) and committed in `public/climate/` (36 files, 4.9 MB), so the site never calls the data server. The averages don't change, so there's nothing to refresh.
- The browser loads only what it shows: two files (about 150 KB each) for a week on the map, and all 36 the first time you click a place for its chart (then cached).
- Weeks are blended linearly between the monthly averages (a month's value sits at its middle).
- Limits:
  - averages over 30 years, not forecasts, and not this year's weather;
  - land only (the sea stays clear);
  - monthly totals only, no number of rainy days;
  - each cell is the average over about 28 km, at the cell's average altitude: a mountain pass is colder than its colour, a valley warmer.

## How it's drawn

Each file is one variable for one month: 1440 × 720 bytes (one per cell, 0 for sea), row-delta coded and deflated (`src/modules/climate/codec.ts` decodes them with the browser's `DecompressionStream`). For the map, two months are blended and drawn onto a square Web Mercator canvas (one pixel per cell), coloured with the scales in `codec.ts`, and shown as an image layer under the base map's labels and the country borders.

## Files

```
scripts/fetch-climate.mjs              one-time download (npm run climate)
public/climate/                        the data, and meta.json (source, licence, grid)
src/modules/climate/codec.ts           file format, week blending, colour scales
src/modules/climate/data.ts            loading, point values, drawing
src/modules/climate/index.ts           overlays, redraws, play, clicks
src/modules/climate/ClimateBar.svelte  slider, play, legend
src/modules/climate/ClimatePoint.svelte  a place's year
src/modules/climate/ExpectedClimate.svelte  usual weather in stage, group and segment cards
```
