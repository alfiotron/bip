import { mount } from 'svelte';
import '@fontsource-variable/instrument-sans';
import 'material-symbols/rounded.css';
import './app.css';
import App from './App.svelte';
import { disableSuggestions } from './lib/noSuggest.js';
import { installTapGuard } from './lib/tapGuard.js';

const app = mount(App, { target: document.getElementById('app') });
disableSuggestions();
installTapGuard();

export default app;
