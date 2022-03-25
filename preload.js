import Store from 'electron-store'

const store = new Store({ encryptionKey: '' })
const setElementById = (id, content) => {
  const el = document.getElementById(id)
  if (el) {
    el.innerHTML = content != null ? content : 'N/A'
  }
}

window.addEventListener('DOMContentLoaded', () => {
  setElementById('app-version', store.get('app.version'))
  setElementById('app-mode', store.get('app.mode'))

  setElementById('license-status', store.get('license.status'))
  setElementById('license-expiry', store.get('license.expiry'))
  setElementById('license-key', store.get('license.key'))
})