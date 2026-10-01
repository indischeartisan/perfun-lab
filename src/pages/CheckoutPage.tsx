import type { ComponentProps } from 'react'
import { CheckoutScreen,ConfirmationScreen } from '../components/CheckoutScreens'
export function CheckoutPage(props:ComponentProps<typeof CheckoutScreen>){return <CheckoutScreen {...props}/>}
export function OrderConfirmationPage(props:ComponentProps<typeof ConfirmationScreen>){return <ConfirmationScreen {...props}/>}
