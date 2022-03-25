const { app, BrowserWindow } = require('electron')
const axios = require('axios').default;
const { autoUpdater } = require('electron-updater')
const unhandled = require('electron-unhandled')
const Store = require('electron-store')
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const path = require('path')
const ipcMain = require('electron').ipcMain;
const { dialog } = require('electron')

unhandled()

const store = new Store({ encryptionKey: '' })
const accountId = 'cf855a89-7bdc-461a-a57c-aea4f4160a31'
const productId = 'a46a2121-9150-4625-bb2e-f7c4d9509a50'
const isDev = process.env.NODE_ENV === 'development'

store.set('app.version', app.getVersion())

async function validateLicenseKey(key) {
  const validation = await fetch(`https://api.keygen.sh/v1/accounts/${accountId}/licenses/actions/validate-key`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      meta: {
        scope: { product: productId },
        key,
      }
    }),
  })
  const { meta, data, errors } = await validation.json()
  if (errors) {
    return { status: validation.status, errors }
  }

  return {
    status: validation.status,
    meta,
    data,
  }
}

async function gateAppLaunchWithLicense(appLauncher) {
  const gateWindow = new BrowserWindow({
    resizable: false,
    frame: false,
    width: 420,
    height: 200,
    webPreferences: {
      preload: path.join(__dirname, 'gate.js'),
      devTools: isDev,
    },
  })

  gateWindow.loadFile('gate.html')

  if (isDev) {
    gateWindow.webContents.openDevTools({ mode: 'detach' })
  }

  ipcMain.on('GATE_SUBMIT', async (_event, { key }) => {
    // Validate the license key
    const res = await validateLicenseKey(key)
    if (res.errors) {
      const [{ code }] = res.errors
      const choice = await dialog.showMessageBox(gateWindow, {
        type: 'error',
        title: 'Your license is invalid',
        message: 'The license key you entered does not exist for this product. Would you like to buy a license?',
        detail: `Error code: ${code ?? res.status}`,
        buttons: [
          'Continue evaluation',
          'Try again',
          'Buy a license',
        ],
      })

      switch (choice.response) {
        case 0:
          // Set to evaluation mode
          store.set('app.mode', 'EVALUATION')
          store.delete('license')

          // Close the license gate window
          gateWindow.close()

          // Launch our main app
          appLauncher(key)

          break
        case 1:
          // noop (dismiss and try again)

          break
        case 2:
          // TODO(ezekg) Open a link to purchase page
          shell.openExternal('https://keygen.sh/for-electron-apps/')

          break
      }

      return
    }

    // Branch on the license's validation code
    const { valid, constant } = res.meta

    switch (constant) {
      // License is valid. All is well.
      case 'VALID':
      // For expired licenses, we still want to allow the app to be used, but automatic
      // updates will not be allowed.
      case 'EXPIRED': {
        const license = res.data

        store.set('license.expiry', license.attributes.expiry)
        store.set('license.key', license.attributes.key)
        store.set('license.status', constant)

        store.set('app.mode', 'LICENSED')

        await dialog.showMessageBox(gateWindow, {
          type: valid ? 'info' : 'warning',
          title: 'Thanks for your business!',
          message: `Your license ID is ${res.data.id.substring(0, 8)}. It is ${constant.toLowerCase()}.`,
          detail: valid ? 'Automatic updates are enabled.' : 'Automatic updates are disabled.',
          buttons: [
            'Continue',
          ],
        })

        // Close the license gate window
        gateWindow.close()

        // Launch our main app
        appLauncher(key)

        break
      }
      // All other validation codes, e.g. SUSPENDED, etc. are treated as invalid.
      default: {
        store.set('app.mode', 'UNLICENSED')
        store.delete('license')

        await dialog.showMessageBox(gateWindow, {
          type: 'error',
          title: 'Your license is invalid',
          message: 'That license key is no longer valid.',
          detail: `Validation code: ${constant}`,
          buttons: [
            'Exit',
          ],
        })

        app.exit(1)

        break
      }
    }
  })
}


// Launch the main application window and configure automatic updates.
function launchAppWithLicenseKey(key) {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      devTools: isDev,
    },
  })

  mainWindow.loadFile('index.html')

  if (!isDev) {
    // Check for updates right away using license key authentication
    autoUpdater.addAuthHeader(`License ${key}`)
    autoUpdater.checkForUpdatesAndNotify()

    // Check for updates periodically
    setInterval(
      autoUpdater.checkForUpdatesAndNotify,
      1000 * 60 * 60 * 3, // 3 hours in ms
    )
  }
}

app.whenReady().then(() => gateAppLaunchWithLicense(launchAppWithLicenseKey))

app.on('window-all-closed', () => app.quit())