import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BottomNav } from '../components/BottomNav'
import { Header } from '../components/Header'
import { useBlend } from '../hooks/useBlend'
import { useCart } from '../hooks/useCart'
import { useLocalStorage } from '../hooks/useLocalStorage'
import type { CustomerOrder, OrderIntent } from '../lib/orders'
import { ExplorePage } from '../pages/ExploreHomePage'
import type { AppView, CompleteSelection, ProductChoice, Selection } from '../types'
import '../styles.css'
import '../theme.css'
import '../checkout.css'
import '../orders.css'
import '../responsive.css'
import '../cloud.css'
import { loadCatalog, type Catalog } from '../lib/catalog'
import { errorMessage } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { AccountMenu } from '../components/AccountMenu'
import { EmailPasswordDialog } from '../components/EmailPasswordDialog'
import { prepareBagCheckout, prepareDirectFormulaCheckout } from '../lib/bagCheckout'
import { isCheckoutDraft, orderIntentsMatchCatalog } from '../lib/storageValidation'
import { bagCheckoutResumeKey, directCheckoutResumeKey, readPendingDirectCheckout, readSessionValue, removeSessionValue, writeSessionValue } from '../lib/checkoutResume'

import { articleHash, articleIdFromHash, articleOriginFromHash, navigationHash, noteHash, noteIdFromHash, type ArticleOrigin, viewFromHash, workspaceView } from './workspaceRouting'
import { getPublishedExploreContentById } from '../data/exploreContent'
import { WorkspaceNavigation } from '../components/WorkspaceNavigation'
import { WorkspaceLoadBoundary } from '../components/WorkspaceLoadBoundary'
import { CustomerRouteLoadBoundary } from '../components/CustomerRouteLoadBoundary'
import { WheelTransferDialog } from '../components/WheelTransferDialog'
import { emptyWheelExplorationState, emptyWheelLayerSelection, type WheelExplorationState, type WheelLayerSelection } from '../data/scentWheel'
import { resolveWheelTransfer, type WheelTransfer, type WheelTransferResolution } from '../lib/wheelTransfer'
import '../admin.css'
import '../explore.css'

const ProductionPage = lazy(() => import('../pages/ProductionPage').then(module => ({ default: module.ProductionPage })))
const FulfillmentPage = lazy(() => import('../pages/FulfillmentPage').then(module => ({ default: module.FulfillmentPage })))
const AdminPage = lazy(() => import('../pages/AdminPage').then(module => ({ default: module.AdminPage })))
const VendorPaymentsPage = lazy(() => import('../pages/VendorPaymentsPage').then(module => ({ default: module.VendorPaymentsPage })))
const VendorWorkPage = lazy(() => import('../pages/VendorWorkPage').then(module => ({ default: module.VendorWorkPage })))
const BuildPage = lazy(() => import('../pages/BuildPage').then(module => ({ default: module.BuildPage })))
const BagPage = lazy(() => import('../pages/BagPage').then(module => ({ default: module.BagPage })))
const CheckoutPage = lazy(() => import('../pages/CheckoutPage').then(module => ({ default: module.CheckoutPage })))
const OrderConfirmationPage = lazy(() => import('../pages/CheckoutPage').then(module => ({ default: module.OrderConfirmationPage })))
const MorePage = lazy(() => import('../pages/MorePage').then(module => ({ default: module.MorePage })))
const NoteLibraryPage = lazy(() => import('../pages/NoteLibraryPage').then(module => ({ default: module.NoteLibraryPage })))
const OrdersPage = lazy(() => import('../pages/OrdersPage').then(module => ({ default: module.OrdersPage })))
const ExploreArticlePage = lazy(() => import('../pages/ExploreArticlePage').then(module => ({ default: module.ExploreArticlePage })))
const ExploreQuickCard = lazy(() => import('../components/ExploreQuickCard').then(module => ({ default: module.ExploreQuickCard })))
const ExploreCollectionPage = lazy(() => import('../pages/ExploreCollectionPage').then(module => ({ default: module.ExploreCollectionPage })))
const NoteLibraryDetailPage = lazy(() => import('../pages/NoteLibraryDetailView').then(module => ({ default: module.NoteLibraryDetailPage })))
const ScentWheelPage = lazy(() => import('../pages/ScentWheelPageRefined').then(module => ({ default: module.ScentWheelPageRefined })))

function directArticleOrigin(articleId: string | null): ArticleOrigin {
  const article = articleId ? getPublishedExploreContentById(articleId) : null
  if (!article) return 'explore'
  return article.category === 'study' ? 'study' : 'fresh'
}

function articleBackLabel(origin: ArticleOrigin) {
  return origin === 'fresh' ? 'Back to Fresh From the Lab' : origin === 'study' ? 'Back to Lab Study' : 'Back to Explore'
}

function isComplete(selection: Selection): selection is CompleteSelection {
  return Boolean(selection.top && selection.middle && selection.base)
}

type WheelTransferReview = { kind: 'availability' | 'replace'; payload: WheelTransfer; resolution: WheelTransferResolution; allowPartial?: boolean }

export default function App() {
  const auth = useAuth()
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    const refresh = () => loadCatalog().then(data => { if (active) { setCatalog(data); setError('') } }).catch(error => { if (active) setError(errorMessage(error)) })
    void refresh()
    window.addEventListener('perfun-catalog-updated', refresh)
    window.addEventListener('focus', refresh)
    return () => { active = false; window.removeEventListener('perfun-catalog-updated', refresh); window.removeEventListener('focus', refresh) }
  }, [attempt])
  if (auth.loading || (auth.user && auth.roleLoading)) return <RoleLoading/>
  if (auth.user && auth.role && auth.role !== 'customer') return <WorkspaceApp auth={auth}/>
  if (auth.user && !auth.role) return <RoleUnavailable auth={auth}/>
  if (!catalog) return <div className="app-shell product-app customer-app"><Header itemCount={0} activeView="build" onNavigate={() => {}} account={<AccountMenu auth={auth} onLogin={() => {}}/>}/><main className="cloud-message">{error ? <><p role="alert">{error}</p><button onClick={() => { setError(''); setAttempt(value => value + 1) }}>Try again</button></> : <p role="status">Loading the lab…</p>}</main></div>
  return <ConnectedApp catalog={catalog} auth={auth}/>
}

function ConnectedApp({ catalog, auth }: { catalog: Catalog; auth: ReturnType<typeof useAuth> }) {
  const [requestedView, setView] = useState<AppView>(() => viewFromHash(window.location.hash, Boolean(readSessionValue(bagCheckoutResumeKey))))
  const [locationHash, setLocationHash] = useState(() => window.location.hash)
  const [quickContentId, setQuickContentId] = useState<string | null>(null)
  const [wheelExploration, setWheelExploration] = useState<WheelExplorationState>(emptyWheelExplorationState)
  const [wheelSelection, setWheelSelection] = useState<WheelLayerSelection>(emptyWheelLayerSelection)
  const [wheelTransferReview, setWheelTransferReview] = useState<WheelTransferReview | null>(null)
  const [authDialogOpen, setAuthDialogOpen] = useState(false)
  const [resumeCheckout, setResumeCheckout] = useState(() => readSessionValue(bagCheckoutResumeKey) === '1')
  const [pendingDirectCheckout, setPendingDirectCheckout] = useState<OrderIntent[] | null>(() => readPendingDirectCheckout(catalog.noteGroups))
  const [resumeDirectCheckout, setResumeDirectCheckout] = useState(() => readSessionValue(directCheckoutResumeKey) !== null)
  useEffect(() => {
    const onHashChange = () => {
      setLocationHash(window.location.hash)
      setView(viewFromHash(window.location.hash, Boolean(readSessionValue(bagCheckoutResumeKey))))
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  const storageOwner = auth.loading ? null : auth.user?.id ?? 'guest'
  const [confirmedOrder, setConfirmedOrder] = useState<CustomerOrder | null>(null)
  const blend = useBlend(catalog.noteGroups, storageOwner)
  const cart = useCart(catalog, storageOwner)
  const [checkoutDraft, setCheckoutDraft] = useLocalStorage<{ userId: string; items: OrderIntent[]; source?: 'bag' | 'direct' } | null>(auth.loading || !auth.user ? null : `perfun:user:${auth.user.id}:checkout-draft`, null, { restore: value => isCheckoutDraft(value) && orderIntentsMatchCatalog(value.items, catalog.noteGroups) ? value : null })
  const preparing = useRef(false)
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [directCheckoutBusy, setDirectCheckoutBusy] = useState(false)
  const [directCheckoutError, setDirectCheckoutError] = useState('')
  const view = workspaceView(auth.role ?? null, requestedView)
  const articleId = articleIdFromHash(locationHash)
  const noteId = noteIdFromHash(locationHash)
  const articleOrigin = articleOriginFromHash(locationHash) ?? directArticleOrigin(articleId)

  const hasMixSelection = Boolean(blend.selection.top || blend.selection.middle || blend.selection.base)

  function applyWheelTransfer(resolution: WheelTransferResolution) {
    blend.applyWheelSelection(resolution.selection)
    setWheelTransferReview(null)
    navigate('build')
  }

  function requestWheelTransfer(payload: WheelTransfer) {
    const resolution = resolveWheelTransfer(payload, catalog)
    if (!resolution.hasAvailableNotes || resolution.issues.length) {
      setWheelTransferReview({ kind: 'availability', payload, resolution })
      return
    }
    if (hasMixSelection) {
      setWheelTransferReview({ kind: 'replace', payload, resolution })
      return
    }
    applyWheelTransfer(resolution)
  }

  function continueWheelTransfer() {
    if (!wheelTransferReview) return
    const resolution = resolveWheelTransfer(wheelTransferReview.payload, catalog)
    if (!resolution.hasAvailableNotes) {
      setWheelTransferReview({ kind: 'availability', payload: wheelTransferReview.payload, resolution })
      return
    }
    if (hasMixSelection) {
      setWheelTransferReview({ kind: 'replace', payload: wheelTransferReview.payload, resolution, allowPartial: true })
      return
    }
    applyWheelTransfer(resolution)
  }

  function replaceWheelTransfer() {
    if (!wheelTransferReview) return
    const resolution = resolveWheelTransfer(wheelTransferReview.payload, catalog)
    if (!resolution.hasAvailableNotes || (resolution.issues.length && !wheelTransferReview.allowPartial)) {
      setWheelTransferReview({ kind: 'availability', payload: wheelTransferReview.payload, resolution })
      return
    }
    applyWheelTransfer(resolution)
  }

  useEffect(() => {
    if (view === requestedView) return
    window.history.replaceState(null, '', navigationHash(view, window.location.pathname, window.location.search))
  }, [requestedView, view])

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const navigate = useCallback((next: AppView) => {
    const hash = navigationHash(next, window.location.pathname, window.location.search)
    setView(next)
    setLocationHash(hash)
    window.history.replaceState(null, '', hash)
    scrollToTop()
  }, [])

  const openArticle = useCallback((id: string, origin: ArticleOrigin = 'explore') => {
    const hash = articleHash(id, origin)
    setView('article')
    setLocationHash(hash)
    window.history.pushState(null, '', hash)
    scrollToTop()
  }, [])

  const openQuickCard = useCallback((id: string) => {
    setQuickContentId(id)
  }, [])

  const openNote = useCallback((id: string) => {
    const hash = noteHash(id)
    setView('note')
    setLocationHash(hash)
    window.history.pushState(null, '', hash)
    scrollToTop()
  }, [])

  function addToBag() {
    if (!isComplete(blend.selection) || blend.product === null || blend.product === 'play-set') return
    cart.add(blend.selection, blend.product)
    blend.markAdded()
  }

  function savePlaySetBlend() {
    if (!isComplete(blend.selection)) return
    blend.savePlaySetBlend(blend.selection)
  }

  function addPlaySetToBag() {
    if (blend.playSetBlends.length !== 3) return
    cart.addPlaySet(blend.playSetBlends)
    blend.markAdded()
  }

  async function checkoutBag() {
    if (preparing.current || auth.loading) return
    if (!auth.user) { writeSessionValue(bagCheckoutResumeKey, '1'); setResumeCheckout(true); setAuthDialogOpen(true); return }
    preparing.current = true; setCheckoutBusy(true); setCheckoutError('')
    try { startCheckout(auth.user.id, prepareBagCheckout(cart.items), 'bag') }
    catch (error) { setCheckoutError(errorMessage(error)) }
    finally { preparing.current = false; setCheckoutBusy(false) }
  }
  const startCheckout = useCallback((userId: string, items: OrderIntent[], source: 'bag' | 'direct' = 'bag') => {
    setCheckoutDraft({ userId, items, source })
    navigate('checkout')
  }, [navigate, setCheckoutDraft])

  const resumeBagCheckout = useCallback((userId: string) => {
    if (!resumeCheckout || preparing.current) return
    removeSessionValue(bagCheckoutResumeKey)
    setResumeCheckout(false)
    preparing.current = true
    setCheckoutBusy(true)
    setCheckoutError('')
    try { startCheckout(userId, prepareBagCheckout(cart.items), 'bag') }
    catch (error) { setCheckoutError(errorMessage(error)) }
    finally { preparing.current = false; setCheckoutBusy(false) }
  }, [cart.items, resumeCheckout, startCheckout])
  function checkoutDirect(product: ProductChoice, formula: CompleteSelection, playSetBlends: CompleteSelection[]) {
    if (preparing.current || directCheckoutBusy) return
    if (auth.loading) { setDirectCheckoutError('Your account is still loading. Please try again.'); return }
    setDirectCheckoutError('')
    let items: OrderIntent[]
    try { items = prepareDirectFormulaCheckout(product, formula, playSetBlends) }
    catch (error) { setDirectCheckoutError(errorMessage(error)); return }

    if (!auth.user) {
      writeSessionValue(directCheckoutResumeKey, JSON.stringify(items))
      setPendingDirectCheckout(items)
      setResumeDirectCheckout(true)
      setAuthDialogOpen(true)
      return
    }

    preparing.current = true
    setDirectCheckoutBusy(true)
    try { startCheckout(auth.user.id, items, 'direct') }
    catch (error) { setDirectCheckoutError(errorMessage(error)) }
    finally { preparing.current = false; setDirectCheckoutBusy(false) }
  }
  const continueDirectCheckout = useCallback((userId: string) => {
    if (!resumeDirectCheckout || preparing.current) return
    if (!pendingDirectCheckout) {
      removeSessionValue(directCheckoutResumeKey)
      setResumeDirectCheckout(false)
      return
    }
    removeSessionValue(directCheckoutResumeKey)
    setPendingDirectCheckout(null)
    setResumeDirectCheckout(false)
    preparing.current = true
    setDirectCheckoutBusy(true)
    setDirectCheckoutError('')
    try { startCheckout(userId, pendingDirectCheckout, 'direct') }
    catch (error) { setDirectCheckoutError(errorMessage(error)) }
    finally { preparing.current = false; setDirectCheckoutBusy(false) }
  }, [pendingDirectCheckout, resumeDirectCheckout, startCheckout])

  const checkoutResumeHandler = useRef<(userId: string) => void>(() => {})
  useLayoutEffect(() => {
    checkoutResumeHandler.current = userId => {
      resumeBagCheckout(userId)
      continueDirectCheckout(userId)
    }
  }, [continueDirectCheckout, resumeBagCheckout])
  useLayoutEffect(() => {
    const onAuthenticated = (event: Event) => {
      const userId = (event as CustomEvent<string>).detail
      if (typeof userId === 'string' && userId) checkoutResumeHandler.current(userId)
    }
    window.addEventListener('perfun-authenticated', onAuthenticated)
    return () => window.removeEventListener('perfun-authenticated', onAuthenticated)
  }, [])
  function orderPlaced(order: CustomerOrder) {
    setConfirmedOrder(order)
    if (checkoutDraft?.source !== 'direct') cart.clear()
    setCheckoutDraft(null)
    navigate('confirmation')
  }

  return <div className="app-shell product-app customer-app">
    <Header itemCount={cart.count} activeView={view === 'article' || view === 'wheel' || view === 'fresh' || view === 'study' || view === 'library' ? 'explore' : view} onNavigate={navigate} fulfillmentOnly={auth.role === 'vendor'} account={<AccountMenu auth={auth} onLogin={() => setAuthDialogOpen(true)}/>}/>
    {auth.error ? <p className="cloud-message" role="alert">{auth.error}</p> : null}
    <main className="app-main">{view === 'bag' && checkoutBusy ? <p className="cloud-message" role="status">Preparing checkout…</p> : null}{view === 'bag' && checkoutError ? <p className="cloud-message" role="alert">{checkoutError}</p> : null}
      <WorkspaceLoadBoundary key={view}><Suspense fallback={<WorkspaceLoading/>}>
      {view === 'admin' ? auth.user && auth.role === 'admin' ? <AdminPage key={auth.user.id} userId={auth.user.id}/> : <div className="screen-empty"><h2>{auth.loading || auth.roleLoading ? 'Loading account…' : 'Admin access required'}</h2><p>This page is available to administrators.</p></div> : null}
      {view === 'fulfillment' ? auth.user && (auth.role === 'vendor' || auth.role === 'admin') ? <FulfillmentPage key={`${auth.user.id}:${auth.role}`} role={auth.role}/> : <div className="screen-empty"><h2>{auth.loading || auth.roleLoading ? 'Loading account…' : 'Fulfillment access required'}</h2><p>This page is available to vendors and administrators.</p>{!auth.user && !auth.loading ? <button onClick={auth.login}>Continue with Google</button> : null}</div> : null}
      {view === 'payouts' ? auth.user && auth.role === 'vendor' ? <VendorPaymentsPage key={auth.user.id}/> : <div className="screen-empty"><h2>{auth.loading || auth.roleLoading ? 'Loading account…' : 'Vendor access required'}</h2><p>Payments are available to vendors.</p></div> : null}
      {view === 'production' ? auth.user && (auth.role === 'perfumer' || auth.role === 'admin' || auth.role === 'vendor') ? <ProductionPage key={`${auth.user.id}:${auth.role}`} userId={auth.user.id} role={auth.role}/> : <div className="screen-empty"><h2>{auth.loading || auth.roleLoading ? 'Loading account…' : 'Production access required'}</h2><p>This page is available to vendors, perfumers and administrators.</p>{!auth.user && !auth.loading ? <button onClick={auth.login}>Continue with Google</button> : null}</div> : null}
      </Suspense></WorkspaceLoadBoundary>
      {view === 'explore' ? <ExplorePage catalog={catalog} onMix={() => navigate('build')} onOpenArticle={openArticle} onOpenQuick={openQuickCard} onViewFresh={() => navigate('fresh')} onViewStudy={() => navigate('study')} onViewLibrary={() => navigate('library')}/> : null}
      {view === 'wheel' ? <Suspense fallback={<ExploreArticleLoading/>}><ScentWheelPage catalog={catalog} onBack={() => navigate('explore')} exploration={wheelExploration} onExplorationChange={setWheelExploration} selectedByLayer={wheelSelection} onSelectedByLayerChange={setWheelSelection} onMixSelection={requestWheelTransfer}/></Suspense> : null}
      {view === 'fresh' || view === 'study' ? <Suspense fallback={<ExploreArticleLoading/>}><ExploreCollectionPage kind={view} onBack={() => navigate('explore')} onOpenArticle={openArticle} onOpenQuick={openQuickCard}/></Suspense> : null}
      {view === 'library' ? <CustomerRouteLoadBoundary key={view}><Suspense fallback={<CustomerRouteLoading/>}><NoteLibraryPage catalog={catalog} onBack={() => navigate('explore')} onOpenNote={openNote}/></Suspense></CustomerRouteLoadBoundary> : null}
      {view === 'note' ? <Suspense fallback={<ExploreArticleLoading/>}><NoteLibraryDetailPage catalog={catalog} noteId={noteId} onBack={() => navigate('library')} onOpenNote={openNote}/></Suspense> : null}
      {view === 'article' ? <Suspense fallback={<ExploreArticleLoading/>}><ExploreArticlePage key={articleId ?? 'missing'} articleId={articleId} backLabel={articleBackLabel(articleOrigin)} onBack={() => navigate(articleOrigin)} onMix={() => navigate('build')}/></Suspense> : null}
      {view === 'build' ? <CustomerRouteLoadBoundary key={view}><Suspense fallback={<CustomerRouteLoading/>}><BuildPage catalog={catalog} selection={blend.selection} product={catalog.productOptions.some(option => option.id === blend.product) ? blend.product : null} playSetBlends={blend.playSetBlends} editingPlaySetIndex={blend.editingPlaySetIndex} added={blend.added} onSelect={blend.choose} onProduct={blend.setProduct} onAdd={addToBag} onSavePlaySetBlend={savePlaySetBlend} onAddPlaySet={addPlaySetToBag} onEditPlaySetBlend={blend.editPlaySetBlend} onCancelPlaySetEdit={blend.cancelPlaySetEdit} onExitPlaySet={blend.exitPlaySet} onGetItNow={checkoutDirect} getItNowBusy={directCheckoutBusy} getItNowError={directCheckoutError} onClearFormula={blend.clearCurrentFormula} onViewBag={() => navigate('bag')}/></Suspense></CustomerRouteLoadBoundary> : null}
      {view === 'bag' ? <CustomerRouteLoadBoundary key={view}><Suspense fallback={<CustomerRouteLoading/>}><BagPage items={cart.items} onQuantity={cart.setQuantity} onSize={cart.setSize} onRemove={cart.remove} onBuild={() => { blend.clearCurrentFormula(); navigate('build') }} onCheckout={checkoutBag}/></Suspense></CustomerRouteLoadBoundary> : null}
      {view === 'checkout' ? auth.user && checkoutDraft?.userId === auth.user.id ? <CustomerRouteLoadBoundary key={view}><Suspense fallback={<CustomerRouteLoading/>}><CheckoutPage key={auth.user.id} userId={auth.user.id} items={checkoutDraft.items} onBack={() => navigate('bag')} onPlaced={orderPlaced}/></Suspense></CustomerRouteLoadBoundary> : <div className="screen-empty"><p>{auth.loading ? 'Loading account…' : 'Add a perfume to your bag to checkout.'}</p><button onClick={() => navigate('bag')}>View Bag</button></div> : null}
      {view === 'confirmation' && confirmedOrder && confirmedOrder.user_id === auth.user?.id ? <CustomerRouteLoadBoundary key={view}><Suspense fallback={<CustomerRouteLoading/>}><OrderConfirmationPage order={confirmedOrder} onBuild={() => { blend.clearCurrentFormula(); navigate('build') }} onOrders={() => navigate('orders')}/></Suspense></CustomerRouteLoadBoundary> : null}
      {view === 'orders' ? <CustomerRouteLoadBoundary key={view}><Suspense fallback={<CustomerRouteLoading/>}><OrdersPage key={auth.user?.id ?? 'guest'} userId={auth.user?.id} onLogin={() => setAuthDialogOpen(true)} onBuild={() => navigate('bag')}/></Suspense></CustomerRouteLoadBoundary> : null}
      {view === 'more' ? <CustomerRouteLoadBoundary key={view}><Suspense fallback={<CustomerRouteLoading/>}><MorePage onOrders={() => navigate('orders')} onFresh={() => navigate('fresh')} onStudy={() => navigate('study')} onLibrary={() => navigate('library')}/></Suspense></CustomerRouteLoadBoundary> : null}
    </main>
    {quickContentId ? <Suspense fallback={null}><ExploreQuickCard contentId={quickContentId} onClose={() => setQuickContentId(null)} onMix={() => { setQuickContentId(null); navigate('build') }}/></Suspense> : null}
    {wheelTransferReview ? <WheelTransferDialog kind={wheelTransferReview.kind} issues={wheelTransferReview.resolution.issues} canContinue={wheelTransferReview.resolution.hasAvailableNotes} onContinueAvailable={continueWheelTransfer} onReplace={replaceWheelTransfer} onClose={() => setWheelTransferReview(null)}/> : null}
    {auth.role !== 'vendor' ? <BottomNav active={view === 'article' || view === 'wheel' || view === 'fresh' || view === 'study' || view === 'library' ? 'explore' : view} count={cart.count} onNavigate={navigate}/> : null}
    <EmailPasswordDialog auth={auth} open={authDialogOpen} onClose={() => { setAuthDialogOpen(false); if (!auth.user && resumeCheckout) { removeSessionValue(bagCheckoutResumeKey); setResumeCheckout(false) } if (!auth.user && resumeDirectCheckout) { removeSessionValue(directCheckoutResumeKey); setPendingDirectCheckout(null); setResumeDirectCheckout(false) } }} onAuthenticated={() => setAuthDialogOpen(false)}/>
  </div>
}

function RoleLoading() {
  return <div className="app-shell product-app workspace-app"><main className="cloud-message" aria-busy="true"><p role="status">Loading secure workspace…</p></main></div>
}

function WorkspaceLoading() {
  return <div className="cloud-message" aria-busy="true"><p role="status">Loading workspace…</p></div>
}

function ExploreArticleLoading() {
  return <div className="explore-article-loading" aria-busy="true"><p role="status">Opening the article…</p></div>
}

function CustomerRouteLoading() {
  return <div className="explore-article-loading" aria-busy="true"><p role="status">Loading the lab…</p></div>
}

function RoleUnavailable({ auth }: { auth: ReturnType<typeof useAuth> }) {
  return <div className="app-shell product-app workspace-app"><header className="workspace-header"><strong>PERFUN LAB</strong><AccountMenu auth={auth} onLogin={() => {}}/></header><main className="screen-empty"><h2>Workspace unavailable</h2><p>Your account role could not be verified. Please sign out and sign in again.</p></main></div>
}

function WorkspaceApp({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const role = auth.role ?? null
  const [requestedView, setRequestedView] = useState<AppView>(() => viewFromHash(window.location.hash, false))
  const view = workspaceView(role, requestedView)
  useEffect(() => {
    const onHashChange = () => setRequestedView(viewFromHash(window.location.hash, false))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  useEffect(() => {
    if (view === requestedView) return
    window.history.replaceState(null, '', navigationHash(view, window.location.pathname, window.location.search))
  }, [requestedView, view])
  const navigate = useCallback((next: AppView) => {
    const allowed = workspaceView(role, next)
    setRequestedView(allowed)
    window.history.replaceState(null, '', navigationHash(allowed, window.location.pathname, window.location.search))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [role])
  if (!auth.user || !role || role === 'customer') return <RoleLoading/>

  const vendor = role === 'vendor'
  const perfumer = role === 'perfumer'
  return <div className={`app-shell product-app workspace-app ${role === 'admin' ? 'workspace-admin' : ''}`}>
    <header className="workspace-header"><button className="wordmark" onClick={() => navigate(role === 'admin' ? 'admin' : 'production')} aria-label="Go to workspace"><img src="/brand/perfun-lab-logo.webp" alt="PERFUN LAB"/></button><strong>{role === 'admin' ? 'ADMIN WORKSPACE' : perfumer ? 'PERFUMER WORKSPACE' : 'VENDOR WORKSPACE'}</strong><AccountMenu auth={auth} onLogin={() => {}}/></header>
    <WorkspaceNavigation role={role} active={view} onNavigate={navigate}/>
    <main className="app-main">
      <WorkspaceLoadBoundary key={view}><Suspense fallback={<WorkspaceLoading/>}>
      {role === 'admin' ? <AdminPage key={auth.user.id} userId={auth.user.id}/> : null}
      {vendor && (view === 'production' || view === 'fulfillment') ? <VendorWorkPage key={`${auth.user.id}:${view}`} userId={auth.user.id} initialStage={view === 'fulfillment' ? 'shipping' : 'order'}/> : null}
      {view === 'production' && perfumer ? <ProductionPage key={`${auth.user.id}:${role}`} userId={auth.user.id} role="perfumer"/> : null}
      {view === 'payouts' && vendor ? <VendorPaymentsPage key={auth.user.id}/> : null}
      </Suspense></WorkspaceLoadBoundary>
    </main>
  </div>
}
