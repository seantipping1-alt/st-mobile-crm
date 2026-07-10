/**
 * Client-side image compression for job attachments.
 * - Resizes to max 1600px wide (preserves aspect ratio)
 * - Trims black borders (scan tool screenshots)
 * - Compresses to 85% JPEG quality
 * - Non-image files pass through untouched
 */

const MAX_WIDTH = 1600
const JPEG_QUALITY = 0.85
const BLACK_THRESHOLD = 30 // pixel brightness below this = "black"
const BORDER_SAMPLE_RATIO = 0.9 // % of row/col pixels that must be black to count as border

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

/**
 * Detect and trim black borders (common on scan tool screenshots).
 * Returns the crop rectangle { x, y, w, h }.
 */
function detectCropBounds(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): { x: number; y: number; w: number; h: number } {
  const imageData = ctx.getImageData(0, 0, width, height)
  const { data } = imageData

  function isPixelBlack(px: number): boolean {
    const r = data[px * 4]
    const g = data[px * 4 + 1]
    const b = data[px * 4 + 2]
    return r < BLACK_THRESHOLD && g < BLACK_THRESHOLD && b < BLACK_THRESHOLD
  }

  function isRowBlack(y: number): boolean {
    let blackCount = 0
    for (let x = 0; x < width; x++) {
      if (isPixelBlack(y * width + x)) blackCount++
    }
    return blackCount / width >= BORDER_SAMPLE_RATIO
  }

  function isColBlack(x: number): boolean {
    let blackCount = 0
    for (let y = 0; y < height; y++) {
      if (isPixelBlack(y * width + x)) blackCount++
    }
    return blackCount / height >= BORDER_SAMPLE_RATIO
  }

  // Find top border
  let top = 0
  while (top < height && isRowBlack(top)) top++

  // Find bottom border
  let bottom = height - 1
  while (bottom > top && isRowBlack(bottom)) bottom--

  // Find left border
  let left = 0
  while (left < width && isColBlack(left)) left++

  // Find right border
  let right = width - 1
  while (right > left && isColBlack(right)) right--

  // Safety: don't crop more than 40% of the image (avoid over-cropping dark photos)
  const cropW = right - left + 1
  const cropH = bottom - top + 1
  if (cropW < width * 0.6 || cropH < height * 0.6) {
    return { x: 0, y: 0, w: width, h: height }
  }

  return { x: left, y: top, w: cropW, h: cropH }
}

/**
 * Compress an image file. Returns a new File with the compressed image.
 * Non-image files are returned as-is.
 */
export async function compressImage(file: File): Promise<File> {
  // Only compress images (not PDFs, documents, etc.)
  if (!file.type.startsWith('image/')) return file

  // Skip SVGs and GIFs (compression doesn't help / breaks animation)
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file

  try {
    const img = await loadImage(file)
    const origW = img.naturalWidth
    const origH = img.naturalHeight

    // Skip tiny images (icons, thumbnails) — not worth compressing
    if (origW <= 200 && origH <= 200) {
      URL.revokeObjectURL(img.src)
      return file
    }

    // Step 1: Draw original to detect crop bounds
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = origW
    tempCanvas.height = origH
    const tempCtx = tempCanvas.getContext('2d')!
    tempCtx.drawImage(img, 0, 0)

    const crop = detectCropBounds(tempCtx, origW, origH)

    // Step 2: Resize cropped region to max width
    let finalW = crop.w
    let finalH = crop.h
    if (finalW > MAX_WIDTH) {
      const ratio = MAX_WIDTH / finalW
      finalW = MAX_WIDTH
      finalH = Math.round(finalH * ratio)
    }

    // Step 3: Draw final compressed image
    const canvas = document.createElement('canvas')
    canvas.width = finalW
    canvas.height = finalH
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, finalW, finalH)

    URL.revokeObjectURL(img.src)

    // Convert to JPEG blob
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', JPEG_QUALITY)
    })

    // Rename extension to .jpg if it wasn't already
    const newName = file.name.replace(/\.[^.]+$/, '.jpg')

    return new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() })
  } catch (err) {
    console.error('Image compression failed, uploading original:', err)
    return file
  }
}
