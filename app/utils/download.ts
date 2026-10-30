// Starts a file download without a server round trip.
// Browsers only allow this straight from a tap or key press, so have `content` ready beforehand.
export function downloadFile(content: BlobPart, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.hidden = true
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Free the file from memory later; revoking right away can cancel the download in some browsers
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
