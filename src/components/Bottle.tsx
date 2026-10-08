import { useState } from 'react'
import { getNoteStickerAsset } from '../lib/noteAssets'
import type { FragranceNote, Selection } from '../types'

export function Bottle({ selection, compact = false }: { selection: Selection; compact?: boolean }) {
  const layers = ['top', 'middle', 'base'] as const
  return <div className={`bottle-scene ${compact ? 'compact' : ''}`} aria-label="Your fragrance bottle preview">
    {!compact && <><span className="orbit orbit-a" /><span className="orbit orbit-b" /></>}
    <div className="bottle">
      <img className="bottle-base-image" src="/bottle/perfun-bottle.webp" alt="" draggable="false" />
      <img className="bottle-wordmark" src="/brand/perfun-lab-logo.webp" alt="" draggable="false" />
      <div className="sticker-stack">
        {layers.map((layer, index) => {
          const note = selection[layer]
          return note
            ? <BottleSticker key={`${layer}:${note.id}`} note={note} index={index} />
            : <span key={layer} className={`bottle-sticker sticker-placeholder sticker-${index}`} aria-hidden="true" />
        })}
      </div>
    </div>
  </div>
}

function BottleSticker({ note, index }: { note: FragranceNote; index: number }) {
  const [assetFailed, setAssetFailed] = useState(false)
  const asset = getNoteStickerAsset(note)

  if (asset && !assetFailed) {
    return <span className={`bottle-sticker bottle-sticker-asset sticker-${index}`} title={note.name}>
      <img src={asset} alt={note.name} draggable="false" decoding="async" onError={() => setAssetFailed(true)} />
    </span>
  }

  return <span className={`bottle-sticker sticker-${index}`} style={{ backgroundColor: note.stickerColor }} title={note.name}><i>{note.icon}</i><strong>{note.name}</strong></span>
}
