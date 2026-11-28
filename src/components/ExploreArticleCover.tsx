import { useState } from 'react'

export function ExploreArticleCover({ src, loading = 'eager' }: { src: string | null; loading?: 'eager' | 'lazy' }) {
  const [failed, setFailed] = useState(false)
  const editorial = src?.startsWith('/explore/covers/') ?? false

  return <div className={`explore-article-cover${editorial ? ' explore-article-cover--editorial' : ''}`} aria-hidden="true">
    {src && !failed ? <img src={src} alt="" loading={loading} onError={() => setFailed(true)}/> : null}
  </div>
}
