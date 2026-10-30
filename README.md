# Touch Grass

A small browser game played with the phone's camera and gyroscope, built with Nuxt 4, Vue 3 and WebGPU.
Disguised as a CAPTCHA, it takes the player through three steps to grow a drawing of vegetables:

1. **Intro**: type the warped words to prove you're "a good working human", then press →.
2. **Sun**: shine a light (phone torch, lamp, the sun) at the camera. The sky turns from night to white and the drawing colors itself in.
3. **Water**: show the camera something blue until the grid is fully blue. Then the plant grows in bouncy steps, and the blue drains back to white.
4. **Wind**: gusts push the plant sideways. Tilt the phone to keep it in the green zone of the bar.
5. **Final**: type "i'll continue to be a hard working human" and press →. The screen blends from white back to night first, like the sun step in reverse. Sending downloads the finished drawing as an SVG ("the harvest") straight from that tap, so it works in every browser, then the game starts over at the sun step.

Without a camera, hold a finger on the screen (or Space on a computer) instead of light or blue. Arrow keys stand in for tilting.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

Camera and motion sensors need HTTPS on a phone. `npm run dev:phone` serves the app on your network over HTTPS, using a local certificate in `.certs/` (`dev-cert.pem` and `dev-key.pem`, not committed). One way to make them is [mkcert](https://github.com/FiloSottile/mkcert):

```bash
mkdir -p .certs && mkcert -cert-file .certs/dev-cert.pem -key-file .certs/dev-key.pem <your-computer-ip> localhost
```

Check types with `npx nuxi typecheck`.

## Testing helpers

Add these to the URL:

| Parameter | What it does |
|---|---|
| `?phase=water` / `wind` / `final` | Start at a later step (`final` tests the harvest download) |
| `?debug` | Shows what the camera measures, plus sliders for the sun step. Press **N** to finish the current step |

The `?debug` sliders are saved on the device. **copy** gives code to paste into `app/app.config.ts`, and **reset** goes back to that file's values.

## Where things are

```
app/
  app.vue                    mounts AppTouchGrass
  app.config.ts              sun step speed and light sensitivity (tunable)
  components/
    AppTouchGrass.vue        the game: steps, frame loop, physics, harvest
    AppTypedCaptcha.vue      typing CAPTCHA: start screen and closing screen
    AppSky.vue               WebGPU noise sky (sun and water steps)
    AppPlant.vue             the vegetable drawing and its color strokes
    AppWind.vue              wind gust animations
    AppLightbar.vue          progress bar
    AppCaptchaGrid.vue       3 × 3 grid lines
    AppEye.vue               round camera preview
    AppFlash.vue             green "step done" frame
    AppDebugMeter.vue        ?debug panel
  composables/
    useCamera.ts             camera → light and blue readings (how light is detected is explained at the top)
    useMotion.ts             gyroscope, touch and keyboard input
    useHarvest.ts            prepares and downloads the SVG
  lib/
    sky.ts                   noise reveal shader for the skies
    shader-fill.ts           minimal runner for Figma shaders
    custom-effects/          the fractal noise shader, copied unchanged from Figma
  utils/                     shared helpers and constants (auto-imported by Nuxt)
  types/touch-grass.ts       shared types
  assets/                    global styles: CSS variables, fonts, grid
public/
  images/                    veggie.svg, stroke files, wind.svg, reference material
  fonts/
```

## Conventions

- Components are named `App…` and auto-imported, as are everything in `app/composables/` and `app/utils/`.
- CSS classes use BEM, with the block named after the component (`.app-lightbar`, `.app-lightbar__mark`, `.app-lightbar--wind`).
- Shared design values are CSS custom properties in `app/assets/_a-params.scss`. Colors also needed in TypeScript are mirrored in `app/utils/touch-grass.ts`.
- Game tuning numbers are named constants at the top of the file that uses them, with their unit in the name or comment.
