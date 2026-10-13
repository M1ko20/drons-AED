/// <reference lib="webworker" />
// Coverage rasters and base optimisation run here so the map stays responsive.
import type { ScenarioConfig } from '../app/config'
import { runAnalysis, runOptimize, type OptimizeRequest } from '../app/engine'
import { loadWorld, type World } from '../data/world'
import type { LngLat } from '../sim/types'

export type WorkerRequest =
  | { type: 'init'; base: string; chkoRings: LngLat[][] | null }
  | { type: 'analysis'; job: number; config: ScenarioConfig }
  | { type: 'optimize'; job: number; config: ScenarioConfig; request: OptimizeRequest }

let world: World | null = null
let chko: LngLat[][] | null = null
let ready: Promise<void> | null = null

const post = (msg: unknown, transfer: Transferable[] = []) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer)

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data
  try {
    if (msg.type === 'init') {
      chko = msg.chkoRings
      ready = loadWorld(msg.base).then((w) => {
        world = w
      })
      await ready
      post({ type: 'ready' })
      return
    }
    await ready
    if (!world) throw new Error('Data nejsou načtena')
    let last = 0
    const progress = (f: number) => {
      const now = performance.now()
      if (now - last > 80 || f >= 1) {
        last = now
        post({ type: 'progress', job: msg.job, kind: msg.type, fraction: f })
      }
    }
    if (msg.type === 'analysis') {
      const r = runAnalysis(world, msg.config, chko, progress)
      post({ type: 'analysis', job: msg.job, result: r }, [r.time.buffer, r.source.buffer, r.mask.buffer])
    } else if (msg.type === 'optimize') {
      post({ type: 'optimize', job: msg.job, result: runOptimize(world, msg.config, chko, msg.request, progress) })
    }
  } catch (e) {
    post({ type: 'error', job: 'job' in msg ? msg.job : -1, kind: msg.type, message: e instanceof Error ? e.message : String(e) })
  }
}
