import test from 'node:test'
import assert from 'node:assert/strict'
import { RajaOngkirShippingCostProvider } from '../supabase/functions/_shared/rajaongkir.ts'

test('destination fields retain provider district and subdistrict without inventing missing values', async () => {
 const provider = new RajaOngkirShippingCostProvider('test','https://rajaongkir.komerce.id/api/v1/',async () => new Response(JSON.stringify({data:[
  {id:4866,label:'Cibangkong, Batununggal, Bandung, Jawa Barat, 40273',city_name:'Bandung',district_name:'Batununggal',subdistrict_name:'Cibangkong',province_name:'Jawa Barat',zip_code:'40273'},
  {id:42,label:'Example',city_name:'Bandung',province_name:'Jawa Barat'}
 ]}),{status:200,headers:{'Content-Type':'application/json'}}))
 const results=await provider.destinations('bandung')
 assert.equal(results[0].label.district,'Batununggal')
 assert.equal(results[0].label.subdistrict,'Cibangkong')
 assert.equal(results[0].label.postal_code,'40273')
 assert.equal(results[1].label.subdistrict,null)
 assert.equal(results[1].label.postal_code,null)
})
