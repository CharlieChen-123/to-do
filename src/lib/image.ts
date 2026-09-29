/** 截图/图片粘贴进来后先压一道，免得 base64 撑爆 IndexedDB 和同步流量 */

const MAX_WIDTH = 1280
/** PNG 压完还超过这个体积就转 JPEG */
const PNG_SIZE_LIMIT = 450 * 1024

export function isImageFile(f: File): boolean {
  return f.type.startsWith('image/')
}

export function pickImageFiles(dt: DataTransfer | null): File[] {
  if (!dt) return []
  const out: File[] = []
  if (dt.files?.length) {
    for (const f of Array.from(dt.files)) if (isImageFile(f)) out.push(f)
  }
  if (!out.length && dt.items?.length) {
    for (const it of Array.from(dt.items)) {
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const f = it.getAsFile()
        if (f) out.push(f)
      }
    }
  }
  return out
}

/** File → 压缩后的 data URL */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('解析图片失败'))
      img.onload = () => {
        try {
          const scale = Math.min(1, MAX_WIDTH / img.width)
          const w = Math.max(1, Math.round(img.width * scale))
          const h = Math.max(1, Math.round(img.height * scale))
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            resolve(String(reader.result))
            return
          }
          ctx.drawImage(img, 0, 0, w, h)

          const png = canvas.toDataURL('image/png')
          if (png.length <= PNG_SIZE_LIMIT) {
            resolve(png)
          } else {
            resolve(canvas.toDataURL('image/jpeg', 0.86))
          }
        } catch {
          resolve(String(reader.result))
        }
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}
