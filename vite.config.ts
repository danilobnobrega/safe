import { defineConfig } from 'vite'
import glsl from 'vite-plugin-glsl'

export default defineConfig({
  plugins: [glsl()],
  // no SPA fallback: a URL that doesn't match a real .html returns 404
  // instead of silently serving index.html
  appType: 'mpa',
  server: {
    // `npm run dev` -> :5181 (90° cap), `npm run dev:spin` -> :5182 (free spin);
    // the port is read in main.ts. Both flags come from the package.json scripts.
    port: 5181,
    open: false,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        garage: 'garage.html',
        garageFocus: 'garage-focus.html',
        garageClassic: 'garage-classic.html',
        heroClassic: 'hero-classic.html',
        lab: 'lab.html',
        heroTunnelLab: 'hero-tunnel-lab.html',
        heroLettersOld: 'hero-letters-old.html',
        heroTunnelDrawn: 'hero-tunnel-drawn.html',
        heroTunnelHidden: 'hero-tunnel-hidden.html',
        heroTunnelSecret: 'hero-tunnel-secret.html',
        heroTunnelSecretReveal: 'hero-tunnel-secret-reveal.html',
        heroPaper: 'hero-paper.html',
        garageRolesColumn: 'garage-roles-column.html',
        heroTunnelMain: 'hero-tunnel-main.html',
        heroPaperV2: 'hero-paper-v2.html',
        heroPaperV3: 'hero-paper-v3.html',
        heroPaperV4: 'hero-paper-v4.html',
        behindModels: 'behind-models.html',
        printerSounds: 'printer-sounds.html',
        cookieSounds: 'cookie-sounds.html',
        heroTunnelReal: 'hero-tunnel-real.html',
        heroTunnelCompare: 'hero-tunnel-compare.html',
        heroTunnelBall50: 'hero-tunnel-ball50.html',
        heroTunnelBall25: 'hero-tunnel-ball25.html',
        heroTunnelBall12: 'hero-tunnel-ball12.html',
        heroTunnelShoeWarrior: 'hero-tunnel-shoe-warrior.html',
        heroTunnelShoeBalance: 'hero-tunnel-shoe-balance.html',
        heroTunnelPegasusGarmin: 'hero-tunnel-pegasus-garmin.html',
        heroTunnelFeatured: 'hero-tunnel-featured.html',
        heroChalk: 'hero-chalk.html',
        heroDrawn: 'hero-drawn.html',
        heroDrawnReal: 'hero-drawn-real.html',
        heroDrawnHold: 'hero-drawn-hold.html',
        heroDrawnGrab: 'hero-drawn-grab.html',
        heroDrawnBoth: 'hero-drawn-both.html',
        heroDrawnGiz: 'hero-drawn-giz.html',
        heroDrawnGizFade: 'hero-drawn-giz-fade.html',
        heroDrawnGizSpread: 'hero-drawn-giz-spread.html',
        heroDrawnGizRise: 'hero-drawn-giz-rise.html',
        heroDrawnGizReal: 'hero-drawn-giz-real.html',
      },
    },
  },
})
