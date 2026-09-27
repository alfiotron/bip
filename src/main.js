import { mount } from 'svelte';
import '@fontsource-variable/instrument-sans';
import 'material-symbols/rounded.css';
import './app.css';
import App from './App.svelte';

const app = mount(App, { target: document.getElementById('app') });

export default app;
