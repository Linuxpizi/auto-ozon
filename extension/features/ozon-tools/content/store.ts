import { reactive } from 'vue'
const rootState = reactive<Record<string, any>>({})
const registeredModules = new Map<string, any>()

const store = {
  state: rootState,
  registerModule(namespace: string, module: any) {
    if (!namespace || !module || registeredModules.has(namespace)) {
      return
    }

    const rawState =
      typeof module.state === 'function' ? module.state() : module.state || {}

    rootState[namespace] = reactive(rawState)
    registeredModules.set(namespace, module)
  },
  hasModule(namespace: string) {
    return registeredModules.has(namespace)
  },
  dispatch(type: string, payload?: any) {
    const [namespace, actionName] = String(type || '').split('/')
    const module = registeredModules.get(namespace)
    if (!module || !module.actions || typeof module.actions[actionName] !== 'function') {
      return
    }

    const localState = rootState[namespace]
    const context = {
      state: localState,
      rootState,
      getters: {},
      commit: (mutationType: string, mutationPayload?: any) => {
        const mutation = module.mutations && module.mutations[mutationType]
        if (typeof mutation === 'function') {
          mutation(localState, mutationPayload)
        }
      },
      dispatch: (nextType: string, nextPayload?: any) => store.dispatch(`${namespace}/${nextType}`, nextPayload),
    }

    return module.actions[actionName](context, payload)
  },
  install(app: any) {
    app.config.globalProperties.$store = store
    app.provide('store', store)
  },
}

export default store
