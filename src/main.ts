import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/theme.css';
import { mount } from 'svelte';
import App from './app/App.svelte';
import { createCore } from './core/core';
import { modules } from './modules';

const core = createCore(document.getElementById('map')!);
mount(App, { target: document.getElementById('app')!, props: { core } });
void core.start(modules);
