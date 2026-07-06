// ─── Client-side image handling ───────────────────────────────────────────────
// Photos are downscaled and JPEG-compressed in the browser, then stored as a
// data URL. Prototype-grade on purpose: it needs zero infrastructure. Before
// production scale, swap the storage side for blob storage (Vercel Blob / S3)
// — this compression step stays useful either way.

export async function fileToCompressedDataUrl(
  file: File,
  maxDim = 1024,
  quality = 0.8
): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('Could not read that image'))
      i.src = url
    })

    const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.width * scale))
    canvas.height = Math.max(1, Math.round(img.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not process that image')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    URL.revokeObjectURL(url)
  }
}
