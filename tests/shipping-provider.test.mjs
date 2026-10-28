import test from 'node:test'
import assert from 'node:assert/strict'
import { RajaOngkirShippingCostProvider, ShippingError } from '../supabase/functions/_shared/rajaongkir.ts'
import { assignAutomaticCourier, resolveShippingRegion, selectAutomaticRate } from '../supabase/functions/_shared/shipping-routing.ts'

function response(status, body) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }) }
test('RajaOngkir provider sends secret only as key header and normalizes automatic J&T rates', async () => {
 let request
 const provider = new RajaOngkirShippingCostProvider('test-secret','https://rajaongkir.komerce.id/api/v1/',async (url, init) => {
  request={url,init}; return response(200,{data:[{name:'J&T Express',code:'jnt',service:'EZ',cost:18000,etd:'2-3 days'}]})
 })
 const rates=await provider.rates(1,2,500,'jnt')
 assert.deepEqual(rates,[{courier_code:'jnt',courier_name:'J&T Express',service:'EZ',amount:18000,etd:'2-3 days'}])
 assert.equal(request.init.headers.key,'test-secret')
 assert.match(request.init.body.toString(),/origin=1/)
 assert.doesNotMatch(request.url,/test-secret/)
})
test('invalid provider output and upstream failure cannot become a fake rate', async () => {
 const invalid = new RajaOngkirShippingCostProvider('test','https://rajaongkir.komerce.id/api/v1/',async () => response(200,{data:[{name:'AnterAja',code:'anteraja',service:'REG',cost:0}]}))
 assert.deepEqual(await invalid.rates(1,2,500,'anteraja'),[])
 const failed = new RajaOngkirShippingCostProvider('test','https://rajaongkir.komerce.id/api/v1/',async () => response(503,{data:null}))
 await assert.rejects(()=>failed.rates(1,2,500,'jnt'),error => error instanceof ShippingError && error.status===502)
})
test('destination IDs and couriers are validated before provider invocation', async () => {
 const provider = new RajaOngkirShippingCostProvider('test','https://rajaongkir.komerce.id/api/v1/',async () => { throw new Error('must not fetch') })
 await assert.rejects(()=>provider.rates(0,2,500,'jnt'),ShippingError)
 await assert.rejects(()=>provider.rates(1,2,500,'anything'),ShippingError)
})

test('canonical province routing assigns J&T only within Java and AnterAja outside Java', () => {
 const origin = { province: 'Banten' }
 assert.equal(resolveShippingRegion(origin), 'java')
 assert.equal(assignAutomaticCourier(origin, { province: 'Jawa Timur' }).courier, 'jnt')
 for (const province of ['Sumatera Selatan', 'Kalimantan Timur', 'Sulawesi Selatan', 'Bali']) {
  assert.equal(assignAutomaticCourier(origin, { province }).courier, 'anteraja', province)
 }
})

test('unknown, ambiguous, and invalid provider regions fail closed', () => {
 assert.equal(resolveShippingRegion({ province: 'Banten Raya' }), null)
 assert.equal(resolveShippingRegion({ province: '' }), null)
 assert.equal(resolveShippingRegion({}), null)
 assert.throws(() => assignAutomaticCourier({ province: 'Banten' }, { province: 'Banten Raya' }), error => error instanceof ShippingError && error.status === 422)
})

test('a client cannot select a rate from a courier other than the assigned route', () => {
 const route = assignAutomaticCourier({ province: 'Banten' }, { province: 'Sumatera Utara' })
 const rates = [
  { courier_code: 'anteraja', courier_name: 'AnterAja', service: 'REG', amount: 20000, etd: '2 days' },
  { courier_code: 'jnt', courier_name: 'J&T Express', service: 'EZ', amount: 18000, etd: '2 days' },
 ]
 assert.equal(selectAutomaticRate(rates, route, 'REG')?.courier_code, 'anteraja')
 assert.equal(selectAutomaticRate(rates, route, 'EZ'), null)
})
