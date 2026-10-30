// Path to a file in public/, including the site's base path.
// Locally the base is "/", on GitHub Pages it is "/<repo-name>/".
export function publicUrl(path: string): string {
  const base = useRuntimeConfig().app.baseURL
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}
