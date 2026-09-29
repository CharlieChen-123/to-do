// 只为在 node 里跑纯逻辑测试而存在的 dexie 替身：不碰 indexedDB
class Dexie {
  constructor(name) { this.name = name }
  version() { return this }
  stores() { return this }
}
const liveQuery = () => ({ subscribe: () => ({ unsubscribe() {} }) })
export { Dexie, liveQuery }
export default Dexie
