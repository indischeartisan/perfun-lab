import test from 'node:test'
import assert from 'node:assert/strict'
import { RajaOngkirShippingCostProvider, ShippingError } from '../supabase/functions/_shared/rajaongkir.ts'

function response(status, body) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }) }
test('RajaOngkir provider sends secret only as key header and normalizes rates', async () => {
 let request
 const provider = new RajaOngkirShippingCostProvider('test-secret','https://rajaongkir.komerce.id/api/v1/',async (url, init) => {
  request={url,init}; return response(200,{data:[{name:'JNE',code:'jne',service:'REG',cost:18000,etd:'2-3 days'}]})
 })
 const rates=await provider.rates(1,2,500,'jne')
 assert.deepEqual(rates,[{courier_code:'jne',courier_name:'JNE',service:'REG',amount:18000,etd:'2-3 days'}])
 assert.equal(request.init.headers.key,'test-secret')
 assert.match(request.init.body.toString(),/origin=1/)
 assert.doesNotMatch(request.url,/test-secret/)
})
test('invalid provider output and upstream failure cannot become a fake rate', async () => {
 const invalid = new RajaOngkirShippingCostProvider('test','https://rajaongkir.komerce.id/api/v1/',async () => response(200,{data:[{name:'JNE',code:'jne',service:'REG',cost:0}]}))
 assert.deepEqual(await invalid.rates(1,2,500,'jne'),[])
 const failed = new RajaOngkirShippingCostProvider('test','https://rajaongkir.komerce.id/api/v1/',async () => response(503,{data:null}))
 await assert.rejects(()=>failed.rates(1,2,500,'jne'),error => error instanceof ShippingError && error.status===502)
})
test('destination IDs and couriers are validated before provider invocation', async () => {
 const provider = new RajaOngkirShippingCostProvider('test','https://rajaongkir.komerce.id/api/v1/',async () => { throw new Error('must not fetch') })
 await assert.rejects(()=>provider.rates(0,2,500,'jne'),ShippingError)
 await assert.rejects(()=>provider.rates(1,2,500,'anything'),ShippingError)
})
