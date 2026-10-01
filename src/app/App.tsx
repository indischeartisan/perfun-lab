import { useEffect, useRef, useState } from 'react'
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
import type { AppView, CompleteSelection, Selection } from '../types'
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
import { prepareBagCheckout } from '../lib/bagCheckout'

import { ProductionPage } from '../pages/ProductionPage'
import { FulfillmentPage } from '../pages/FulfillmentPage'
import { AdminPage } from '../pages/AdminPage'
import '../admin.css'



function isComplete(selection: Selection): selection is CompleteSelection {
  return Boolean(selection.top && selection.middle && selection.base)
}

function viewFromHash(): AppView {
  const value = window.location.hash.slice(1)
  if (!value && sessionStorage.getItem('perfun-return-to-bag')) return 'bag'
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
  const [resumeCheckout, setResumeCheckout] = useState(() => sessionStorage.getItem('perfun-return-to-bag') === '1')
  useEffect(() => {
    const onHashChange = () => setView(viewFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  const [confirmedOrder, setConfirmedOrder] = useState<CustomerOrder | null>(null)
  const blend = useBlend(catalog.noteGroups)
  const cart = useCart(catalog)
  const [checkoutDraft, setCheckoutDraft] = useLocalStorage<{ userId: string; items: OrderIntent[] } | null>('perfun-checkout-draft-v1', null)
  const auth = useAuth()
  useEffect(() => { if (auth.passwordRecovery) setAuthDialogOpen(true) }, [auth.passwordRecovery])
  const preparing = useRef(false)
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const view = auth.role === 'vendor' ? 'fulfillment' : requestedView

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function navigate(next: AppView) {
    setView(next)
    window.history.replaceState(null, '', ['bag', 'checkout', 'production', 'fulfillment', 'admin'].includes(next) ? `#${next}` : window.location.pathname + window.location.search)
    scrollToTop()
  }

  function addToBag() {
    if (!isComplete(blend.selection) || blend.product === null || blend.product === 'play-set') return
    cart.add(blend.selection, blend.product)
    blend.markAdded()
  }

  function addPlaySetBlend() {
    if (!isComplete(blend.selection)) return
    blend.addPlaySetBlend(blend.selection)
  }

  function addPlaySetToBag() {
    if (blend.playSetBlends.length !== 3) return
    cart.addPlaySet(blend.playSetBlends)
    blend.markAdded()
  }

  async function checkoutBag() {
    if (preparing.current || auth.loading) return
    if (!auth.user) { sessionStorage.setItem('perfun-return-to-bag', '1'); setResumeCheckout(true); setAuthDialogOpen(true); return }
    preparing.current = true; setCheckoutBusy(true); setCheckoutError('')
    try { startCheckout(prepareBagCheckout(cart.items)) }
    catch (error) { setCheckoutError(errorMessage(error)) }
    finally { preparing.current = false; setCheckoutBusy(false) }
  }
  function startCheckout(items: OrderIntent[]) {
    if (!auth.user) return
    setCheckoutDraft({ userId: auth.user.id, items })
    navigate('checkout')
  }
  useEffect(() => {
    if (!auth.user || !resumeCheckout || auth.loading || preparing.current) return
    sessionStorage.removeItem('perfun-return-to-bag')
    setResumeCheckout(false)
    preparing.current = true
    setCheckoutBusy(true)
    setCheckoutError('')
    try { startCheckout(prepareBagCheckout(cart.items)) }
    catch (error) { setCheckoutError(errorMessage(error)) }
    finally { preparing.current = false; setCheckoutBusy(false) }
  }, [auth.user, auth.loading, cart.items, resumeCheckout])
  function orderPlaced(order: CustomerOrder) {
    setConfirmedOrder(order)
    cart.clear()
    setCheckoutDraft(null)
    navigate('confirmation')
  }

  return <div className="app-shell product-app">
    <Header itemCount={cart.count} activeView={view} onNavigate={navigate} fulfillmentOnly={auth.role === 'vendor'} account={<AccountMenu auth={auth} onLogin={() => setAuthDialogOpen(true)}/>}/>
    {auth.error ? <p className="cloud-message" role="alert">{auth.error}</p> : null}
    {auth.role === 'perfumer' || auth.role === 'admin' ? <div className="account-bar"><button aria-current={view === 'production' ? 'page' : undefined} onClick={() => navigate('production')}>Production Queue</button></div> : null}
    {auth.role === 'vendor' || auth.role === 'admin' ? <div className="account-bar"><button aria-current={view === 'fulfillment' ? 'page' : undefined} onClick={() => navigate('fulfillment')}>Vendor Fulfillment</button></div> : null}
    {auth.role === 'admin' ? <div className="account-bar"><button onClick={() => navigate('admin')}>Admin Dashboard</button></div> : null}
    <main className="app-main">{view === 'bag' && checkoutBusy ? <p className="cloud-message" role="status">Preparing checkout…</p> : null}{view === 'bag' && checkoutError ? <p className="cloud-message" role="alert">{checkoutError}</p> : null}
      {view === 'admin' ? auth.user && auth.role === 'admin' ? <AdminPage key={auth.user.id} userId={auth.user.id}/> : <div className="screen-empty"><h2>{auth.loading || auth.roleLoading ? 'Loading account…' : 'Admin access required'}</h2><p>This page is available to administrators.</p></div> : null}
      {view === 'fulfillment' ? auth.user && (auth.role === 'vendor' || auth.role === 'admin') ? <FulfillmentPage key={`${auth.user.id}:${auth.role}`}/> : <div className="screen-empty"><h2>{auth.loading || auth.roleLoading ? 'Loading account…' : 'Fulfillment access required'}</h2><p>This page is available to vendors and administrators.</p>{!auth.user && !auth.loading ? <button onClick={auth.login}>Continue with Google</button> : null}</div> : null}
      {view === 'production' ? auth.user && (auth.role === 'perfumer' || auth.role === 'admin') ? <ProductionPage key={`${auth.user.id}:${auth.role}`} userId={auth.user.id} role={auth.role}/> : <div className="screen-empty"><h2>{auth.loading || auth.roleLoading ? 'Loading account…' : 'Production access required'}</h2><p>This page is available to perfumers and administrators.</p>{!auth.user && !auth.loading ? <button onClick={auth.login}>Continue with Google</button> : null}</div> : null}
      {view === 'build' ? <BuildPage catalog={catalog} selection={blend.selection} product={catalog.productOptions.some(option => option.id === blend.product) ? blend.product : null} playSetBlends={blend.playSetBlends} added={blend.added} onSelect={blend.choose} onProduct={blend.setProduct} onAdd={addToBag} onAddPlaySetBlend={addPlaySetBlend} onAddPlaySet={addPlaySetToBag} onReset={blend.reset} onViewBag={() => navigate('bag')}/> : null}
      {view === 'bag' ? <BagPage items={cart.items} onQuantity={cart.setQuantity} onSize={cart.setSize} onRemove={cart.remove} onBuild={() => { blend.reset(); navigate('build') }} onCheckout={checkoutBag}/> : null}
      {view === 'checkout' ? auth.user && checkoutDraft?.userId === auth.user.id ? <CheckoutPage key={auth.user.id} userId={auth.user.id} items={checkoutDraft.items} onBack={() => navigate('bag')} onPlaced={orderPlaced}/> : <div className="screen-empty"><p>{auth.loading ? 'Loading account…' : 'Add a perfume to your bag to checkout.'}</p><button onClick={() => navigate('bag')}>View Bag</button></div> : null}
      {view === 'confirmation' && confirmedOrder && confirmedOrder.user_id === auth.user?.id ? <OrderConfirmationPage order={confirmedOrder} onBuild={() => { blend.reset(); navigate('build') }} onOrders={() => navigate('orders')}/> : null}
      {view === 'orders' ? <OrdersPage key={auth.user?.id ?? 'guest'} userId={auth.user?.id} onLogin={() => setAuthDialogOpen(true)} onBuild={() => navigate('bag')}/> : null}
      {view === 'more' ? <MorePage/> : null}
    </main>
    {auth.role !== 'vendor' ? <BottomNav active={view} count={cart.count} onNavigate={navigate}/> : null}
    <EmailPasswordDialog auth={auth} open={authDialogOpen} onClose={() => setAuthDialogOpen(false)} onAuthenticated={() => setAuthDialogOpen(false)}/>
  </div>
}
