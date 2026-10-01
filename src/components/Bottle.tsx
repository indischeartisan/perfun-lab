import type { Selection } from '../types'

export function Bottle({ selection, compact = false }: { selection: Selection; compact?: boolean }) {
  const layers = ['top', 'middle', 'base'] as const
  return <div className={`bottle-scene ${compact ? 'compact' : ''}`} aria-label="Your fragrance bottle preview">
    {!compact && <><span className="orbit orbit-a" /><span className="orbit orbit-b" /></>}
    <div className="bottle">
      <img className="bottle-base-image" src="/bottle/perfun-bottle.webp" alt="" draggable="false" />
      <div className="sticker-stack">
        {layers.map((layer, index) => {
          const note = selection[layer]
          return note
            ? <span key={layer} className={`bottle-sticker sticker-${index}`} style={{ backgroundColor: note.stickerColor }} title={note.name}><i>{note.icon}</i><strong>{note.name}</strong></span>
            : <span key={layer} className={`bottle-sticker sticker-placeholder sticker-${index}`} aria-hidden="true" />
        })}
      </div>
    </div>
  </div>
}
