import { useState } from 'react'

export function ExploreArticleCover({ src, loading = 'eager' }: { src: string | null; loading?: 'eager' | 'lazy' }) {
  const [failed, setFailed] = useState(false)

  return <div className="explore-article-cover" aria-hidden="true">
    {src && !failed ? <img src={src} alt="" loading={loading} onError={() => setFailed(true)}/> : null}
  </div>
}
