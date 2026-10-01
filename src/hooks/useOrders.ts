import { PROTOTYPE_SHIPPING } from '../data/products'
import type { CartItem, GuestDetails, TestOrder } from '../types'
import { useLocalStorage } from './useLocalStorage'

export function useOrders(){
  const [orders,setOrders]=useLocalStorage<TestOrder[]>('perfun-orders-v1',[])
  function place(customer:GuestDetails,items:CartItem[]){const createdAt=new Date().toISOString(),subtotal=items.reduce((sum,item)=>sum+item.price*item.quantity,0);const order:TestOrder={id:crypto.randomUUID(),orderNumber:makeOrderNumber(createdAt,orders.length+1),createdAt,status:'Payment Confirmed',customer,items,subtotal,shipping:PROTOTYPE_SHIPPING,total:subtotal+PROTOTYPE_SHIPPING};setOrders(current=>[order,...current]);return order}
  return {orders,place}
}
function makeOrderNumber(date:string,sequence:number){return `PF-${date.slice(2,10).replaceAll('-','')}-${String(sequence).padStart(3,'0')}`}
