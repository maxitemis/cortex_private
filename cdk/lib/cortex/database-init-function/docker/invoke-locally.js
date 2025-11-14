// invoke-locally.js
import { handler } from './index.js'

const event = {
  ResourceProperties: {
    localConfig: {
      username: 'root',
      password: 'mysql',
      appUser: {
        username: 'cortex-sand', // has no effect rather than being used in a log message
        password: '123456',
      },
    },
  },
  RequestType: 'Create',
}
;(async () => {
  await handler(event)
})()
