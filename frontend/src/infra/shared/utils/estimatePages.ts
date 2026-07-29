const OFFICE_EXTS = new Set(['docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt', 'csv'])

function extOf(name: string): string {
  return (name.split('.').pop() || '').toLowerCase()
}

export async function estimatePages(file: File): Promise<number> {
  const ext = extOf(file.name)

  if (ext === 'pdf') {
    const { pdfjs } = await import('react-pdf')
    const arrayBuffer = await file.arrayBuffer()
    try {
      const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise
      return doc.numPages
    } catch {
      return 1
    }
  }

  if (OFFICE_EXTS.has(ext)) {
    try {
      if (ext === 'doc' || ext === 'docx') {
        const { renderAsync } = await import('docx-preview')
        const tempDiv = document.createElement('div')
        await renderAsync(await file.arrayBuffer(), tempDiv, undefined, {
          breakPages: true,
          inWrapper: true,
          ignoreLastRenderedPageBreak: false,
          ignoreWidth: true,
          experimental: true,
        })
        return tempDiv.querySelectorAll('section.docx').length || 1
      }
      if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
        return wb.SheetNames.length || 1
      }
      if (ext === 'ppt' || ext === 'pptx') {
        const { init } = await import('pptx-preview')
        const previewer = init(document.createElement('div'), { width: 100, height: 100, mode: 'slide' })
        await previewer.preview(await file.arrayBuffer())
        return (previewer as { slideCount: number }).slideCount || 1
      }
    } catch {
      // no-op
    }
  }

  return 1
}
