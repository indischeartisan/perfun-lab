import { RajaOngkirShippingCostProvider, ShippingError } from '../_shared/rajaongkir.ts'
import { shippingCors, shippingFailure, shippingJson, shippingProvider, shippingRpc, shippingUser } from '../_shared/shipping-runtime.ts'

async function digest(value:string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('') }

Deno.serve(async req => {
 if (req.method === 'OPTIONS') return new Response(null,{status:204,headers:shippingCors(req)})
 if (req.method !== 'POST') return new Response(null,{status:405,headers:shippingCors(req)})
 try {
  const userId=await shippingUser(req), body=await shippingJson(req), action=body.action==='bind' ? 'bind' : 'search', query=typeof body.query==='string' ? body.query.trim().replace(/\s+/g,' ') : ''
  if (query.length<3 || query.length>160) throw new ShippingError('Enter at least 3 characters to search a destination.',400)
  if (!await shippingRpc<boolean>('shipping_feature_ready',{})) throw new ShippingError('Shipping is not configured yet. Please try again later.',503)
  const cacheKey=await digest(query.toLowerCase()), cached=await shippingRpc<unknown[]|null>('shipping_destination_cache_get',{p_cache_key:cacheKey})
  if(action==='bind') {
   const addressId=typeof body.address_id==='string' ? body.address_id : '', destinationId=Number(body.destination_id)
   if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(addressId) || !Number.isSafeInteger(destinationId) || destinationId<=0 || !cached) throw new ShippingError('Search and select a valid shipping destination first.',422)
   const destination=cached.find((value:unknown)=>value && typeof value==='object' && Number((value as {id?:unknown}).id)===destinationId) as {label?:unknown}|undefined
   if(!destination || !destination.label || typeof destination.label!=='object') throw new ShippingError('Selected shipping destination is no longer available.',422)
   await shippingRpc('bind_address_shipping_destination',{p_user_id:userId,p_address_id:addressId,p_destination_id:destinationId,p_label:destination.label})
   return Response.json({bound:true,destination_id:destinationId},{headers:shippingCors(req)})
  }
  await shippingRpc('consume_shipping_rate_limit',{p_user_id:userId,p_action:'destination'})
  const { key,baseUrl }=shippingProvider(), provider=new RajaOngkirShippingCostProvider(key,baseUrl)
  const rows=cached ?? await provider.destinations(query)
  if(!cached) await shippingRpc('shipping_destination_cache_put',{p_cache_key:cacheKey,p_query:query.toLowerCase(),p_results:rows})
  return Response.json({destinations:rows},{headers:shippingCors(req)})
 } catch(error) { return shippingFailure(error,req) }
})
