import type { TodoApi } from '@shared/types'

declare global {
  const __APP_VERSION__: string

  interface Window {
    api: TodoApi
  }
}
