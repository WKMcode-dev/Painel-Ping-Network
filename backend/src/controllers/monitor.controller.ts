import type { Request, Response } from 'express'
import type { MonitorService } from '../services/monitor.service.js'

export class MonitorController {
  constructor(private readonly monitorService: MonitorService) {}

  status = (_request: Request, response: Response): void => {
    response.json(this.monitorService.getSnapshot())
  }

  events = (request: Request, response: Response): void => {
    const rawHostId = request.params.hostId
    const hostId = Array.isArray(rawHostId) ? rawHostId[0] : rawHostId
    response.json(hostId ? this.monitorService.getHostEvents(hostId) : [])
  }

  refresh = async (_request: Request, response: Response): Promise<void> => {
    await this.monitorService.runCycle()
    response.json(this.monitorService.getSnapshot())
  }
}
