import type { CartItem } from './cart'
export type OrderStatus = 'Payment Confirmed' | 'Blending' | 'Packed' | 'Shipped'
export interface GuestDetails { fullName:string; whatsapp:string; email:string; address:string; city:string; province:string; postalCode:string }
export interface TestOrder { id:string; orderNumber:string; createdAt:string; status:OrderStatus; customer:GuestDetails; items:CartItem[]; subtotal:number; shipping:number; total:number }
