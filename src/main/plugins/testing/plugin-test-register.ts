/** `node --import openkodo-test-register.mjs`: installs the plugin test hooks shipped beside it. */
import { register } from 'node:module'

register('./openkodo-test-hooks.mjs', import.meta.url)
