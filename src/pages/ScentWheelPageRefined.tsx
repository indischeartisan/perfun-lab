import { ArrowLeft, ArrowRight, Check, RefreshCw, Sparkles, X } from 'lucide-react'
import { useId, useMemo, type CSSProperties, type Dispatch, type SetStateAction } from 'react'
import { activeWheelNotes, emptyWheelExplorationState, emptyWheelLayerSelection, familiesForPreset, isWheelLayerNoteDisabled, noteFamilyMetadata, resetWheelExploration, scentFamilies, scentFamilyLabels, scentFamilyMetadata, selectedWheelNoteIds, surpriseFamilies, toggleWheelFamily, toggleWheelLayerSelection, unmappedWheelNoteIds, wheelLayers, wheelNotesForLayer, type ScentFamily, type WheelExplorerPreset, type WheelExplorationState, type WheelLayerSelection } from '../data/scentWheel'
import type { Catalog } from '../lib/catalog'
import { getNoteStickerAsset } from '../lib/noteAssets'
import { wheelTransferFromLayerIds, type WheelTransfer } from '../lib/wheelTransfer'
import type { NoteLayer } from '../types'

const presetModes: Array<{ id: WheelExplorerPreset; number: string; title: string; copy: string; symbol: 'single' | 'harmony' | 'contrast' | 'discovery' | 'free' }> = [
  { id: 'family', number: '01', title: 'Single Family', copy: 'Kenali karakter dan notes dari satu keluarga aroma.', symbol: 'single' },
  { id: 'harmonious', number: '02', title: 'Olfactive Harmony', copy: 'Jelajahi keluarga aroma yang saling melengkapi.', symbol: 'harmony' },
  { id: 'bold', number: '03', title: 'Olfactive Contrast', copy: 'Temukan pertemuan karakter aroma yang berbeda.', symbol: 'contrast' },
  { id: 'surprise', number: '04', title: 'Scent Discovery', copy: 'Biarkan lab memilihkan eksplorasi tak terduga.', symbol: 'discovery' },
  { id: 'custom', number: '05', title: 'Free Exploration', copy: 'Pilih dan gabungkan keluarga aroma sesukamu.', symbol: 'free' },
]

const layerCopy: Record<NoteLayer, { number: string; title: string; copy: string }> = {
  top: { number: '01', title: 'TOP NOTES', copy: 'Aroma pertama yang menyapa.' },
  middle: { number: '02', title: 'MIDDLE NOTES', copy: 'Karakter utama racikanmu.' },
  base: { number: '03', title: 'BASE NOTES', copy: 'Fondasi yang menemani lebih lama.' },
}

const WHEEL_CENTER = 200
const WHEEL_OUTER_RADIUS = 192
const WHEEL_INNER_RADIUS = 68

function pointAt(angle: number, radius: number) {
  const radians = ((angle - 90) * Math.PI) / 180
  return { x: WHEEL_CENTER + radius * Math.cos(radians), y: WHEEL_CENTER + radius * Math.sin(radians) }
}

function sectorPath(index: number, sectorAngle: number) {
  const middle = index * sectorAngle
  const start = pointAt(middle - sectorAngle / 2, WHEEL_OUTER_RADIUS)
  const end = pointAt(middle + sectorAngle / 2, WHEEL_OUTER_RADIUS)
  const innerEnd = pointAt(middle + sectorAngle / 2, WHEEL_INNER_RADIUS)
  const innerStart = pointAt(middle - sectorAngle / 2, WHEEL_INNER_RADIUS)
  return `M ${start.x} ${start.y} A ${WHEEL_OUTER_RADIUS} ${WHEEL_OUTER_RADIUS} 0 0 1 ${end.x} ${end.y} L ${innerEnd.x} ${innerEnd.y} A ${WHEEL_INNER_RADIUS} ${WHEEL_INNER_RADIUS} 0 0 0 ${innerStart.x} ${innerStart.y} Z`
}

function labelArc(index: number, sectorAngle: number) {
  const middle = index * sectorAngle
  const reverse = Math.cos(middle * Math.PI / 180) < 0
  const start = pointAt(middle + (reverse ? 1 : -1) * sectorAngle / 2, 173)
  const end = pointAt(middle + (reverse ? -1 : 1) * sectorAngle / 2, 173)
  return `M ${start.x} ${start.y} A 173 173 0 0 ${reverse ? 0 : 1} ${end.x} ${end.y}`
}

export function ScentWheelPageRefined({ catalog, onBack, exploration, onExplorationChange, selectedByLayer, onSelectedByLayerChange, onMixSelection }: { catalog: Catalog; onBack: () => void; exploration: WheelExplorationState; onExplorationChange: Dispatch<SetStateAction<WheelExplorationState>>; selectedByLayer: WheelLayerSelection; onSelectedByLayerChange: Dispatch<SetStateAction<WheelLayerSelection>>; onMixSelection: (payload: WheelTransfer) => void }) {
  const wheelId = useId()
  const notes = useMemo(() => activeWheelNotes(catalog), [catalog])
  const { activeFamilyIds, activePreset: preset, focusedFamilyId: focusFamily } = exploration
  const activeFamilies = scentFamilies.filter(family => activeFamilyIds.includes(family))
  const selectedIds = selectedWheelNoteIds(selectedByLayer)
  const selected = wheelLayers.map(layer => ({ layer, note: selectedByLayer[layer] ? notes.find(note => note.id === selectedByLayer[layer]) ?? null : null }))
  const unmappedNoteIds = useMemo(() => unmappedWheelNoteIds(catalog), [catalog])
  const sectorAngle = 360 / scentFamilies.length

  function choosePreset(next: WheelExplorerPreset) {
    onExplorationChange(current => {
      if (next !== 'custom' && !current.focusedFamilyId) return current
      const nextFamilies = next === 'surprise' ? surpriseFamilies(catalog) : next === 'custom' ? current.activeFamilyIds : familiesForPreset(current.focusedFamilyId!, next)
      return { activePreset: next, activeFamilyIds: nextFamilies, focusedFamilyId: next === 'surprise' ? nextFamilies[0] ?? null : current.focusedFamilyId }
    })
  }

  function selectFamily(next: ScentFamily) {
    onExplorationChange(current => ({ activePreset: 'custom', focusedFamilyId: next, activeFamilyIds: toggleWheelFamily(current.activeFamilyIds, next) }))
  }

  function toggleNote(layer: NoteLayer, id: string) { onSelectedByLayerChange(current => toggleWheelLayerSelection(current, layer, id)) }
  function clearFamilies() { onExplorationChange(emptyWheelExplorationState()) }
  function resetAll() { const reset = resetWheelExploration(); onExplorationChange({ ...emptyWheelExplorationState(), activeFamilyIds: reset.familyIds }); onSelectedByLayerChange(emptyWheelLayerSelection()) }

  return <section className="scent-wheel-page">
    <button className="explore-back" type="button" onClick={onBack}><ArrowLeft aria-hidden="true"/> Kembali ke Explore</button>
    <header className="scent-wheel-header"><span>SCENT WHEEL</span><h1>Jelajahi keluarga aroma.</h1><p>Pilih satu keluarga, lihat arah eksplorasinya, lalu simpan hingga tiga note yang membuatmu penasaran.</p></header>
    <div className="scent-wheel-layout">
      <div className="scent-wheel-control">
        <div className="interactive-wheel" aria-label="Pilih keluarga aroma">
          <svg className={`scent-wheel-svg${activeFamilies.length ? ' has-selection' : ''}`} viewBox="0 0 400 400" role="group" aria-label="Sepuluh sektor keluarga aroma">
          <defs>{scentFamilies.map((family, index) => <path key={family} id={`${wheelId}-${family}`} d={labelArc(index, sectorAngle)}/>)}</defs>
          {scentFamilies.map((item, index) => {
            const sample = notes.find(note => noteFamilyMetadata[note.id]?.primary === item)
            const asset = sample ? getNoteStickerAsset(sample) : null
            const active = activeFamilyIds.includes(item)
            const middleAngle = index * sectorAngle
            const stickerPoint = pointAt(middleAngle, 111)
            const label = item === 'aquatic-clean' ? 'AQUATIC' : scentFamilyLabels[item].toUpperCase()
            return <g className={`wheel-sector${active ? ' active' : ''}`} style={{ '--sector-color': scentFamilyMetadata[item].color } as CSSProperties} key={item} role="button" tabIndex={0} aria-label={`${scentFamilyLabels[item]}${active ? ', aktif' : ''}`} aria-pressed={active} onClick={() => selectFamily(item)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectFamily(item) } }}>
              <path d={sectorPath(index, sectorAngle)}/>
              {asset ? <image href={asset} x={stickerPoint.x - 27} y={stickerPoint.y - 27} width="54" height="54" preserveAspectRatio="xMidYMid meet"/> : <text className="wheel-sector-fallback" x={stickerPoint.x} y={stickerPoint.y}>✦</text>}
              <text className="wheel-sector-label"><textPath href={`#${wheelId}-${item}`} startOffset="50%">{label}</textPath></text>
            </g>
          })}
          <circle className="wheel-center" cx="200" cy="200" r="68"/>
          <image className="wheel-center-logo" href="/brand/perfun-lab-logo.webp" x="159" y="180" width="82" height="40" preserveAspectRatio="xMidYMid meet" aria-label="Perfun Lab"/>
          </svg>
        </div>
        <p className="wheel-status" aria-live="polite">{activeFamilies.length ? <><span>{activeFamilies.length} families active</span>Exploring: <strong>{activeFamilies.map(item => scentFamilyLabels[item]).join(' + ')}</strong></> : 'Choose a scent family to begin.'}</p>
        <div className="wheel-reset-actions"><button type="button" onClick={clearFamilies} disabled={!activeFamilies.length}>Clear Families</button><button type="button" onClick={resetAll} disabled={!activeFamilies.length && !selectedIds.length && !focusFamily && preset === 'custom'}>Reset All</button></div>
      </div>
      <div className="scent-wheel-presets">
        <span className="scent-wheel-presets-eyebrow">EXPLORATION MODES</span>
        <h2>Explore Your Way</h2>
        <p className="scent-wheel-presets-intro">Pilih cara untuk menjelajahi dunia aroma.</p>
        <div className="exploration-mode-grid">
          {presetModes.map(mode => {
            const active = preset === mode.id
            const disabled = mode.id !== 'custom' && !focusFamily
            const descriptionId = `exploration-mode-${mode.id}-description`
            return <article key={mode.id} className={`exploration-mode-card exploration-mode-${mode.id}${active ? ' active' : ''}`}>
              <button type="button" className="exploration-mode-select" aria-pressed={active} aria-describedby={descriptionId} disabled={disabled} onClick={() => choosePreset(mode.id)}>
                <span className="exploration-mode-number" aria-hidden="true">{mode.number}</span>
                <span className={`exploration-mode-symbol symbol-${mode.symbol}`} aria-hidden="true"><i/><i/><i/><i/><i/></span>
                <strong>{mode.title}</strong>
                <small id={descriptionId}>{mode.copy}</small>
                {active ? <span className="exploration-mode-active" aria-label="Mode aktif">ACTIVE</span> : null}
              </button>
              {mode.id === 'surprise' && active ? <button className="wheel-reroll" type="button" onClick={() => choosePreset('surprise')}><RefreshCw aria-hidden="true"/> Discover Again</button> : null}
            </article>
          })}
        </div>
        <aside><Sparkles aria-hidden="true"/><p>Preset adalah bantuan eksplorasi, bukan aturan formula.</p></aside>
      </div>
    </div>
    <section className="wheel-notes" aria-labelledby="wheel-notes-title">
      <div className="wheel-notes-heading"><div><span>NOTES YANG BISA DILIHAT</span><h2 id="wheel-notes-title">{activeFamilies.length ? 'Pilih satu note untuk tiap layer' : 'Pilih keluarga aroma terlebih dahulu'}</h2><p>{activeFamilies.length ? 'Setiap layer memiliki satu slot. Pilihanmu tetap tersimpan saat cara eksplorasi berubah.' : 'Sektor yang aktif akan menampilkan notes dari katalog aktif.'}</p></div></div>
      {unmappedNoteIds.length ? <p className="wheel-unmapped-notice">{unmappedNoteIds.length} note aktif belum memiliki metadata Wheel dan tidak ditampilkan.</p> : null}
      {activeFamilies.length ? <div className="wheel-layer-groups">{wheelLayers.map(layer => {
        const familyNotes = wheelNotesForLayer(catalog, activeFamilyIds, layer)
        const layerInfo = layerCopy[layer]
        return <section className="wheel-layer-group" key={layer} aria-labelledby={`wheel-layer-${layer}`}><header><div><span>{layerInfo.number} / {layerInfo.title}</span><h3 id={`wheel-layer-${layer}`}>{layerInfo.copy}</h3></div><small>{selectedByLayer[layer] ? 'Slot terisi' : 'Slot tersedia'}</small></header>{familyNotes.length ? <div className="wheel-note-grid">{familyNotes.map(note => {
          const active = selectedByLayer[layer] === note.id
          const disabled = isWheelLayerNoteDisabled(selectedByLayer, layer, note.id)
          const asset = getNoteStickerAsset(note)
          const metadata = noteFamilyMetadata[note.id]
          return <button type="button" className={active ? 'selected' : ''} aria-pressed={active} disabled={disabled} key={note.id} onClick={() => toggleNote(layer, note.id)}><span>{asset ? <img src={asset} alt=""/> : note.icon}</span><strong>{note.name}</strong><small>{scentFamilyLabels[metadata.primary]}{metadata.secondary ? ` · ${scentFamilyLabels[metadata.secondary]}` : ''}</small>{active ? <Check aria-hidden="true"/> : <i className="wheel-add" aria-hidden="true">+</i>}</button>
        })}</div> : <p className="wheel-family-empty">Belum ada note aktif di keluarga ini.</p>}</section>
      })}</div> : <div className="wheel-empty-state"><Sparkles aria-hidden="true"/><p>Belum ada family aktif. Ketuk sektor mana pun untuk mulai eksplorasi.</p></div>}
    </section>
    <section className="wheel-selection" aria-live="polite"><div><span>{selectedIds.length}/3 NOTES DIPILIH</span><h2>{selectedIds.length ? 'Pilihanmu untuk dieksplor.' : 'Belum ada note dipilih.'}</h2><p>Preview ini belum diterapkan ke Mixing Table. Posisi Top, Middle, dan Base sudah mengikuti pilihanmu di sini.</p></div><div className="wheel-layer-summary">{selected.map(({ layer, note }) => <div key={layer} className={note ? 'filled' : ''}><span>{layerCopy[layer].title}</span>{note ? <button type="button" onClick={() => toggleNote(layer, note.id)} aria-label={`Batalkan ${note.name} dari ${layerCopy[layer].title}`}>{getNoteStickerAsset(note) ? <img src={getNoteStickerAsset(note)!} alt=""/> : null}<strong>{note.name}</strong><X aria-hidden="true"/></button> : <p>Belum dipilih</p>}</div>)}</div><div className="wheel-selection-actions"><button className="wheel-mix-button" type="button" disabled={!selectedIds.length} onClick={() => onMixSelection(wheelTransferFromLayerIds(selectedByLayer))}>Mix These Notes <ArrowRight aria-hidden="true"/></button><button className="wheel-back-button" type="button" onClick={onBack}>Kembali ke Explore <ArrowRight aria-hidden="true"/></button></div></section>
  </section>
}
