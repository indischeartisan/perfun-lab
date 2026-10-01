import type { CompleteSelection } from './blend'
export type BottleSize = 10 | 30
export type ProductChoice = BottleSize | 'play-set'
export interface SingleCartItem { kind?:'single'; id:string; notes:CompleteSelection; size:BottleSize; quantity:number; price:number }
export interface PlaySetCartItem { kind:'play-set'; id:string; blends:CompleteSelection[]; quantity:number; price:number }
export type CartItem = SingleCartItem | PlaySetCartItem
