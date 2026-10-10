import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BottomNav } from '../components/BottomNav'
import { Header } from '../components/Header'
import { useBlend } from '../hooks/useBlend'
import { useCart } from '../hooks/useCart'
import { useLocalStorage } from '../hooks/useLocalStorage'
import type { CustomerOrder, OrderIntent } from '../lib/orders'
import { BagPage } from '../pages/BagPage'
import { BuildPage } from '../pages/BuildPage'
import { CheckoutPage, OrderConfirmationPage } from '../pages/CheckoutPage'
import { MorePage } from '../pages/MorePage'
import { OrdersPage } from '../pages/OrdersPage'
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

import { ProductionPage } from '../pages/ProductionPage'
import { FulfillmentPage } from '../pages/FulfillmentPage'
import { AdminPage } from '../pages/AdminPage'
import { VendorPaymentsPage } from '../pages/VendorPaymentsPage'
import '../admin.css'



function isComplete(selection: Selection): selection is CompleteSelection {
  return Boolean(selection.top && selection.middle && selection.base)
}

function viewFromHash(): AppView {
  const value = window.location.hash.slice(1)
  if (!value && readSessionValue(bagCheckoutResumeKey)) return 'bag'
  return ['bag', 'checkout', 'orders', 'production', 'fulfillment', 'admin'].includes(value) ? value as AppView : 'build'
}

export default function App() {
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
  if (!catalog) return <div className="app-shell product-app"><Header itemCount={0} activeView="build" onNavigate={() => {}}/><main className="cloud-message">{error ? <><p role="alert">{error}</p><button onClick={() => { setError(''); setAttempt(value => value + 1) }}>Try again</button></> : <p role="status">Loading the lab…</p>}</main></div>
  return <ConnectedApp catalog={catalog}/>
}

function ConnectedApp({ catalog }: { catalog: Catalog }) {
  const [requestedView, setView] = useState<AppView>(viewFromHash)
  const [authDialogOpen, setAuthDialogOpen] = useState(false)
  const [resumeCheckout, setResumeCheckout] = useState(() => readSessionValue(bagCheckoutResumeKey) === '1')
  const [pendingDirectCheckout, setPendingDirectCheckout] = useState<OrderIntent[] | null>(() => readPendingDirectCheckout(catalog.noteGroups))
  const [resumeDirectCheckout, setResumeDirectCheckout] = useState(() => readSessionValue(directCheckoutResumeKey) !== null)
  useEffect(() => {
    const onHashChange = () => setView(viewFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  const auth = useAuth()
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
  const view = auth.role === 'vendor' && requestedView !== 'production' && requestedView !== 'fulfillment' ? 'production' : requestedView

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const navigate = useCallback((next: AppView) => {
    setView(next)
    window.history.replaceState(null, '', ['bag', 'checkout', 'production', 'fulfillment', 'admin'].includes(next) ? `#${next}` : window.location.pathname + window.location.search)
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

  return <div className="app-shell product-app">
    <Header itemCount={cart.count} activeView={view} onNavigate={navigate} fulfillmentOnly={auth.role === 'vendor'} account={<AccountMenu auth={auth} onLogin={() => setAuthDialogOpen(true)}/>}/>
    {auth.error ? <p className="cloud-message" role="alert">{auth.error}</p> : null}
    {auth.role === 'vendor' ? <nav className="workspace-nav" aria-label="Vendor workspace"><button aria-current={view === 'production' ? 'page' : undefined} onClick={() => navigate('production')}>Production</button><button aria-current={view === 'fulfillment' ? 'page' : undefined} onClick={() => navigate('fulfillment')}>Fulfillment</button><button aria-current={view === 'payouts' ? 'page' : undefined} onClick={() => navigate('payouts')}>Payments</button></nav> : null}
    {auth.role === 'perfumer' || auth.role === 'admin' ? <div className="account-bar"><button aria-current={view === 'production' ? 'page' : undefined} onClick={() => navigate('production')}>Production Queue</button></div> : null}
    {auth.role === 'admin' ? <div className="account-bar"><button aria-current={view === 'fulfillment' ? 'page' : undefined} onClick={() => navigate('fulfillment')}>Vendor Fulfillment</button></div> : null}
    {auth.role === 'admin' ? <div className="account-bar"><button onClick={() => navigate('admin')}>Admin Dashboard</button></div> : null}
    <main className="app-main">{view === 'bag' && checkoutBusy ? <p className="cloud-message" role="status">Preparing checkout…</p> : null}{view === 'bag' && checkoutError ? <p className="cloud-message" role="alert">{checkoutError}</p> : null}
      {view === 'admin' ? auth.user && auth.role === 'admin' ? <AdminPage key={auth.user.id} userId={auth.user.id}/> : <div className="screen-empty"><h2>{auth.loading || auth.roleLoading ? 'Loading account…' : 'Admin access required'}</h2><p>This page is available to administrators.</p></div> : null}
      {view === 'fulfillment' ? auth.user && (auth.role === 'vendor' || auth.role === 'admin') ? <FulfillmentPage key={`${auth.user.id}:${auth.role}`} role={auth.role}/> : <div className="screen-empty"><h2>{auth.loading || auth.roleLoading ? 'Loading account…' : 'Fulfillment access required'}</h2><p>This page is available to vendors and administrators.</p>{!auth.user && !auth.loading ? <button onClick={auth.login}>Continue with Google</button> : null}</div> : null}
      {view === 'payouts' ? auth.user && auth.role === 'vendor' ? <VendorPaymentsPage key={auth.user.id}/> : <div className="screen-empty"><h2>{auth.loading || auth.roleLoading ? 'Loading account…' : 'Vendor access required'}</h2><p>Payments are available to vendors.</p></div> : null}
      {view === 'production' ? auth.user && (auth.role === 'perfumer' || auth.role === 'admin' || auth.role === 'vendor') ? <ProductionPage key={`${auth.user.id}:${auth.role}`} userId={auth.user.id} role={auth.role}/> : <div className="screen-empty"><h2>{auth.loading || auth.roleLoading ? 'Loading account…' : 'Production access required'}</h2><p>This page is available to vendors, perfumers and administrators.</p>{!auth.user && !auth.loading ? <button onClick={auth.login}>Continue with Google</button> : null}</div> : null}
      {view === 'build' ? <BuildPage catalog={catalog} selection={blend.selection} product={catalog.productOptions.some(option => option.id === blend.product) ? blend.product : null} playSetBlends={blend.playSetBlends} editingPlaySetIndex={blend.editingPlaySetIndex} added={blend.added} onSelect={blend.choose} onProduct={blend.setProduct} onAdd={addToBag} onSavePlaySetBlend={savePlaySetBlend} onAddPlaySet={addPlaySetToBag} onEditPlaySetBlend={blend.editPlaySetBlend} onCancelPlaySetEdit={blend.cancelPlaySetEdit} onExitPlaySet={blend.exitPlaySet} onGetItNow={checkoutDirect} getItNowBusy={directCheckoutBusy} getItNowError={directCheckoutError} onClearFormula={blend.clearCurrentFormula} onViewBag={() => navigate('bag')}/> : null}
      {view === 'bag' ? <BagPage items={cart.items} onQuantity={cart.setQuantity} onSize={cart.setSize} onRemove={cart.remove} onBuild={() => { blend.clearCurrentFormula(); navigate('build') }} onCheckout={checkoutBag}/> : null}
      {view === 'checkout' ? auth.user && checkoutDraft?.userId === auth.user.id ? <CheckoutPage key={auth.user.id} userId={auth.user.id} items={checkoutDraft.items} onBack={() => navigate('bag')} onPlaced={orderPlaced}/> : <div className="screen-empty"><p>{auth.loading ? 'Loading account…' : 'Add a perfume to your bag to checkout.'}</p><button onClick={() => navigate('bag')}>View Bag</button></div> : null}
      {view === 'confirmation' && confirmedOrder && confirmedOrder.user_id === auth.user?.id ? <OrderConfirmationPage order={confirmedOrder} onBuild={() => { blend.clearCurrentFormula(); navigate('build') }} onOrders={() => navigate('orders')}/> : null}
      {view === 'orders' ? <OrdersPage key={auth.user?.id ?? 'guest'} userId={auth.user?.id} onLogin={() => setAuthDialogOpen(true)} onBuild={() => navigate('bag')}/> : null}
      {view === 'more' ? <MorePage/> : null}
    </main>
    {auth.role !== 'vendor' ? <BottomNav active={view} count={cart.count} onNavigate={navigate}/> : null}
    <EmailPasswordDialog auth={auth} open={authDialogOpen} onClose={() => { setAuthDialogOpen(false); if (!auth.user && resumeCheckout) { removeSessionValue(bagCheckoutResumeKey); setResumeCheckout(false) } if (!auth.user && resumeDirectCheckout) { removeSessionValue(directCheckoutResumeKey); setPendingDirectCheckout(null); setResumeDirectCheckout(false) } }} onAuthenticated={() => setAuthDialogOpen(false)}/>
  </div>
}
