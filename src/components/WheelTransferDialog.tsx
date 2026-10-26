import { useEffect, useRef } from 'react'
import type { WheelTransferIssue } from '../lib/wheelTransfer'

type ReviewKind = 'availability' | 'replace'

export interface WheelTransferDialogProps {
  kind: ReviewKind
  issues?: WheelTransferIssue[]
  canContinue?: boolean
  onContinueAvailable: () => void
  onReplace: () => void
  onClose: () => void
}

function issueCopy(issue: WheelTransferIssue) {
  const layer = issue.layer[0].toUpperCase() + issue.layer.slice(1)
  if (issue.reason === 'wrong-layer') return `${issue.id} tidak tersedia untuk layer ${layer}.`
  if (issue.reason === 'duplicate') return `${issue.id} dipilih lebih dari satu kali.`
  if (issue.reason === 'soapy-conflict') return 'Soapy hanya dapat digunakan pada satu layer.'
  return `${issue.id} sudah tidak tersedia di katalog aktif.`
}

export function WheelTransferDialog({ kind, issues = [], canContinue = false, onContinueAvailable, onReplace, onClose }: WheelTransferDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { onClose(); return }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled)'))
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); returnFocusRef.current?.focus() }
  }, [onClose])

  const availability = kind === 'availability'
  return <div className="wheel-transfer-layer" role="presentation">
    <button className="wheel-transfer-backdrop" type="button" aria-label="Close transfer dialog" onClick={onClose}/>
    <section className="wheel-transfer-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="wheel-transfer-title">
      <h2 id="wheel-transfer-title">{availability ? 'A few notes need attention.' : 'Ready to Remix?'}</h2>
      {availability ? <><p>Beberapa pilihanmu tidak lagi tersedia untuk layer yang dipilih.</p><ul>{issues.map((issue, index) => <li key={`${issue.layer}-${issue.id}-${index}`}>{issueCopy(issue)}</li>)}</ul><p>{canContinue ? 'Kamu bisa melanjutkan dengan note yang masih tersedia, atau kembali untuk memperbaiki pilihan.' : 'Tidak ada note valid yang bisa diterapkan. Kembali ke Scent Wheel untuk memperbaiki pilihanmu.'}</p></> : <p>Kamu sudah memiliki racikan di Mixing Table. Menggunakan pilihan dari Scent Wheel akan menggantikan racikan tersebut.</p>}
      <div className="wheel-transfer-actions">{availability ? <><button className="wheel-transfer-primary" type="button" disabled={!canContinue} onClick={onContinueAvailable}>Continue with Available Notes</button><button ref={closeRef} type="button" onClick={onClose}>Back to Wheel</button></> : <><button className="wheel-transfer-primary" type="button" onClick={onReplace}>Replace Mix</button><button ref={closeRef} type="button" onClick={onClose}>Keep Current Mix</button></>}</div>
    </section>
  </div>
}
