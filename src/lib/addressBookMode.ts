export type AddressBookMode = 'manage' | 'select'

export function shouldAutoSelectAddress(mode: AddressBookMode) { return mode === 'select' }
