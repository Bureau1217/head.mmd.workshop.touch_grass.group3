// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/_main.scss'],
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'Touch Grass',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        // Phone status bar color. Starts as --app-color-night; AppTouchGrass updates it as the sun comes up.
        { name: 'theme-color', content: '#131313' },
      ],
    },
  },
})
