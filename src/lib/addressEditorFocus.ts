type AddressEditorIdentity = { id: string } | null

// Form values change on every keystroke. The dialog lifecycle must only react
// to an editor session opening or closing, never to those value updates.
export function addressEditorFocusKey(editor: AddressEditorIdentity) {
  return editor?.id ?? null
}
