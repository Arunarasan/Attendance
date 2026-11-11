import { useT } from '../lib/i18n'

/** Full-screen loading page: the logo, a gold-and-green bar that sweeps across, and a short line of text. */
export default function LoadingScreen() {
  const { t } = useT()
  return (
    <div className="ld" role="status" aria-live="polite">
      <div className="ld-in">
        <img className="ld-logo" src="/logo.webp" alt="Arudra Attender" />
        <div className="ld-bar" aria-hidden="true"><i /></div>
        <p className="ld-txt">{t('loading')}</p>
      </div>
    </div>
  )
}
