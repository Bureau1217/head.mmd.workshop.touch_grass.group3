# Touch Grass

A small browser game played with the phone's camera and gyroscope, built with Nuxt 4, Vue 3 and WebGPU.
Disguised as a CAPTCHA, it takes the player through three steps to grow a drawing of vegetables:

1. **Intro**: type the warped words to prove you're "a good working human", then press →.
2. **Sun**: shine a light (phone torch, lamp, the sun) at the camera. The sky turns from night to white and the drawing colors itself in.
3. **Water**: show the camera something blue until the grid is fully blue. Then the plant grows in bouncy steps, and the blue drains back to white.
4. **Wind**: gusts keep blowing the crops off the screen, somewhere around you (a new gust 9 seconds after they land). Turn around with the phone to find them (the bar at the bottom is a compass: the marker shows where they are), then keep them in the middle of the screen for 3 seconds.
5. **Final**: the screen blends from white back to night (the sun step in reverse), then a 3D tomato appears that turns as you tilt the phone. **harvest** downloads the model (`.stl`) straight from that tap, so it works in every browser, then the game fades back to the start CAPTCHA.

Without a camera, hold a finger on the screen (or Space on a computer) instead of light or blue. Arrow keys (or holding a finger left/right of center) stand in for turning.

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
| `?phase=water` / `wind` / `final` | Start at a later step (`final` shows the tomato and tests the harvest download) |
| `?debug` | Shows what the camera measures, plus sliders for the sun step. Press **N** to finish the current step |

The `?debug` sliders are saved on the device. **copy** gives code to paste into `app/app.config.ts`, and **reset** goes back to that file's values.

## Where things are

```
app/
  app.vue                    mounts AppTouchGrass
  app.config.ts              sun step speed and light sensitivity (tunable)
  components/
    AppTouchGrass.vue        the game: steps, frame loop, physics
    AppTypedCaptcha.vue      typing CAPTCHA: start screen
    AppTomato.vue            closing screen: 3D tomato and the harvest button
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
    useMotion.ts             gyroscope heading, touch and keyboard input
  lib/
    sky.ts                   noise reveal shader for the skies
    tomato.ts                three.js scene for the tomato; prepares the model download
    tomato-calyx.ts          stem, leaves and skin colors added to the STL tomato
    shader-fill.ts           minimal runner for Figma shaders
    custom-effects/          the fractal noise shader, copied unchanged from Figma
  utils/                     shared helpers and constants (auto-imported by Nuxt)
  types/touch-grass.ts       shared types
  assets/                    global styles: CSS variables, fonts, grid
public/
  images/                    veggie.svg, stroke files, wind.svg, reference material
  Model/tomat_2.stl          the 3D tomato (STL: shape only; colors, stem and leaves are added in app/lib/)
  fonts/
```

## Conventions

- Components are named `App…` and auto-imported, as are everything in `app/composables/` and `app/utils/`.
- CSS classes use BEM, with the block named after the component (`.app-lightbar`, `.app-lightbar__mark`, `.app-lightbar--wind`).
- Shared design values are CSS custom properties in `app/assets/_a-params.scss`. Colors also needed in TypeScript are mirrored in `app/utils/touch-grass.ts`.
- Game tuning numbers are named constants at the top of the file that uses them, with their unit in the name or comment.
