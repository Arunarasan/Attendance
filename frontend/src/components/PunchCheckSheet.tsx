import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../lib/i18n'
import { IAlert } from './icons'

export type Issue = { code: string; message: string }

/**
 * Shown when a punch failed a check. Nothing has been recorded or sent to HR yet: the person fixes it and tries again,
 * sends it to HR with a reason, or cancels.
 */
export default function PunchCheckSheet({ issues, blocked, busy, error, onRetry, onSend, onCancel }: {
  issues: Issue[]; blocked: boolean; busy: boolean; error?: string
  onRetry: () => void; onSend: (note: string) => void; onCancel: () => void
}) {
  const { t } = useT()
  const [note, setNote] = useState('')
  const [touched, setTouched] = useState(false)
  const missing = touched && !note.trim()
  const text = (code: string, suffix = '') => { const k = `pc_${code}${suffix}`; const v = t(k); return v === k ? '' : v }
  return createPortal(
    <div className="pcs-back" role="dialog" aria-modal="true" aria-label={blocked ? t('pc_titleBlocked') : t('pc_title')}>
      <div className="pcs">
        <h3><IAlert size={22} />{blocked ? t('pc_titleBlocked') : t('pc_title')}</h3>
        <p className="pcs-intro">{blocked ? t('pc_introBlocked') : t('pc_intro')}</p>
        <ul className="pcs-list">
          {issues.map(i => (
            <li key={i.code + i.message}>
              <span className="pcs-x" aria-hidden="true">✕</span>
              <div><b>{text(i.code) || i.message}</b>{text(i.code) && i.message !== text(i.code) && <small className="pcs-det">{i.message}</small>}
                {text(i.code, '_h') && <small>{text(i.code, '_h')}</small>}</div>
            </li>))}
        </ul>
        {!blocked && <>
          <label htmlFor="pcs-note">{t('pc_noteLabel')}</label>
          <textarea id="pcs-note" rows={2} maxLength={300} value={note} placeholder={t('pc_notePh')} className={missing ? 'bad' : ''}
            onChange={e => setNote(e.target.value)} onBlur={() => setTouched(true)} />
          {missing && <small className="pcs-err">{t('pc_noteNeeded')}</small>}
        </>}
        {error && <div className="err">{error}</div>}
        <div className="pcs-actions">
          <button type="button" className="pcs-primary" disabled={busy} onClick={onRetry}>{t('pc_retry')}</button>
          {!blocked && <button type="button" className="pcs-send" disabled={busy} onClick={() => { setTouched(true); if (note.trim()) onSend(note.trim()) }}>{busy ? t('pc_sending') : t('pc_send')}</button>}
          <button type="button" className="pcs-cancel" disabled={busy} onClick={onCancel}>{t('pc_cancel')}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
