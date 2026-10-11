import { RajaOngkirShippingCostProvider, ShippingError, allowedCouriers, type Rate } from '../_shared/rajaongkir.ts'
import { shippingCors, shippingFailure, shippingJson, shippingProvider, shippingRpc, shippingUser } from '../_shared/shipping-runtime.ts'

type Context={origin_destination_id:number;origin_version:number;package_profile_version:number;address:{destination_id:number;destination_label:Record<string,unknown>}}
type Weight={weight_grams:number;package_profile_version:number}
async function digest(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('') }
Deno.serve(async req => {
 if(req.method==='OPTIONS') return new Response(null,{status:204,headers:shippingCors(req)})
 if(req.method!=='POST') return new Response(null,{status:405,headers:shippingCors(req)})
 try {
  const userId=await shippingUser(req), body=await shippingJson(req), addressId=typeof body.address_id==='string' ? body.address_id : '', courier=typeof body.courier==='string' ? body.courier.toLowerCase() : ''
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(addressId) || !allowedCouriers.has(courier)) throw new ShippingError('Invalid shipping quote request',400)
  if(!Array.isArray(body.items) || body.items.length > 20) throw new ShippingError('Invalid shipping quote request',400)
  await shippingRpc('consume_shipping_rate_limit',{p_user_id:userId,p_action:'quote'})
  const context=await shippingRpc<Context>('shipping_quote_context',{p_user_id:userId,p_address_id:addressId})
  const weight=await shippingRpc<Weight>('shipping_weight_for_items',{p_items:body.items})
  const cacheKey=await digest(JSON.stringify({v:context.origin_version,p:weight.package_profile_version,o:context.origin_destination_id,d:context.address.destination_id,w:weight.weight_grams,c:courier}))
  const cached=await shippingRpc<{rates:Rate[];expires_at:string}|null>('shipping_quote_cache_get',{p_cache_key:cacheKey})
  const {key,baseUrl}=shippingProvider(), rates=cached?.rates ?? await new RajaOngkirShippingCostProvider(key,baseUrl).rates(context.origin_destination_id,context.address.destination_id,weight.weight_grams,courier)
  if(!rates.length) throw new ShippingError('No shipping service is available for this route.',422)
  if(!cached) await shippingRpc('shipping_quote_cache_put',{p_cache_key:cacheKey,p_origin_version:context.origin_version,p_package_profile_version:weight.package_profile_version,p_origin_destination_id:context.origin_destination_id,p_destination_id:context.address.destination_id,p_weight_grams:weight.weight_grams,p_courier_code:courier,p_rates:rates})
  const requestedService=typeof body.service==='string' ? body.service.trim() : ''
  if(!requestedService) return Response.json({origin_version:context.origin_version,package_profile_version:weight.package_profile_version,weight_grams:weight.weight_grams,rates},{headers:shippingCors(req)})
  const selected=rates.find(rate=>rate.service===requestedService)
  if(!selected) throw new ShippingError('Selected shipping service is not available.',422)
  const quote=await shippingRpc('create_shipping_quote',{p_user_id:userId,p_address_id:addressId,p_items:body.items,p_courier_code:selected.courier_code,p_courier_name:selected.courier_name,p_service:selected.service,p_amount:selected.amount,p_etd:selected.etd})
  return Response.json({quote},{headers:shippingCors(req)})
 } catch(error) { return shippingFailure(error,req) }
})
