/**
 * Client-side PDF → plain text via pdfjs-dist.
 * Never send PDF bytes over the room WebSocket — only extracted text goes into RulesPack.body.
 */

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { BODY_HARD_LIMIT } from './rulesPack'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

/** Cap raw PDF upload size (bytes). Extracted text is still gated by BODY_HARD_LIMIT. */
export const PDF_FILE_HARD_LIMIT = 20 * 1024 * 1024

export class PdfExtractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PdfExtractError'
  }
}

function isPasswordError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { name?: string; code?: number; message?: string }
  if (e.name === 'PasswordException') return true
  const msg = String(e.message ?? '').toLowerCase()
  return msg.includes('password') || msg.includes('encrypted')
}

/**
 * Extract plain text from a PDF File in the browser.
 * Does not call file.text() — reads as ArrayBuffer only.
 */
export async function extractTextFromPdf(file: File): Promise<string> {
  if (file.size <= 0) {
    throw new PdfExtractError('That PDF looks empty.')
  }
  if (file.size > PDF_FILE_HARD_LIMIT) {
    throw new PdfExtractError(
      `PDF file too large (max ~${Math.round(PDF_FILE_HARD_LIMIT / (1024 * 1024))} MB). Try a smaller file or paste text.`,
    )
  }

  const buffer = await file.arrayBuffer()
  // Copy into a detached ArrayBuffer for pdfjs (avoids SharedArrayBuffer issues)
  const data = new Uint8Array(buffer)

  let pdf
  try {
    pdf = await getDocument({ data, useSystemFonts: true }).promise
  } catch (err) {
    if (isPasswordError(err)) {
      throw new PdfExtractError(
        'This PDF is password-protected. Remove the password or paste the rules text instead.',
      )
    }
    const name = err && typeof err === 'object' ? (err as { name?: string }).name : ''
    if (name === 'InvalidPDFException') {
      throw new PdfExtractError(
        'Could not read that file as a PDF. Try re-saving it, or paste text / use .txt / .md.',
      )
    }
    throw new PdfExtractError(
      err instanceof Error
        ? `Could not open PDF: ${err.message}`
        : 'Could not open that PDF.',
    )
  }

  try {
    const parts: string[] = []
    let total = 0

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const content = await page.getTextContent()
      const pageText = content.items
        .map((item) => ('str' in item ? String(item.str) : ''))
        .join(' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim()

      if (pageText) {
        parts.push(pageText)
        total += pageText.length + (parts.length > 1 ? 2 : 0)
        if (total > BODY_HARD_LIMIT) {
          throw new PdfExtractError(
            `Extracted text is too large for the table (max ${BODY_HARD_LIMIT.toLocaleString()} characters). Use a shorter PDF or paste a summary.`,
          )
        }
      }
    }

    const text = parts.join('\n\n').trim()
    if (!text) {
      throw new PdfExtractError(
        'No extractable text found — this may be a scanned/image-only PDF. Paste the rules or use a text-based PDF / .txt / .md.',
      )
    }
    if (text.length > BODY_HARD_LIMIT) {
      throw new PdfExtractError(
        `Extracted text is too large for the table (max ${BODY_HARD_LIMIT.toLocaleString()} characters). Use a shorter PDF or paste a summary.`,
      )
    }
    return text
  } finally {
    await pdf.destroy().catch(() => undefined)
  }
}
