import { expect, test } from '@playwright/test'
const now = new Date().toISOString()
// Duas redes artificiais: os testes não sondam equipamentos reais.
const hosts = ['Garagem', 'Administrativo'].map((group, i) => ({
  id: `host-${i}`,
  name: `Dispositivo ${group}`,
  group,
  location: '',
  address: `192.0.2.${i + 1}`,
  status: 'offline',
  latencyMs: null,
  averageLatencyMs: null,
  minLatencyMs: null,
  maxLatencyMs: null,
  packetLossPct: 100,
  availabilityPct: 0,
  ttl: null,
  lastCheckedAt: now,
  lastError: null,
  lastOnlineAt: null,
  lastOfflineAt: now,
  lastTransitionAt: now,
  currentDowntimeMs: 0,
  consecutiveFailures: 2,
  history: [],
}))
const snapshot = {
  generatedAt: now,
  hosts,
  recentEvents: [],
  summary: {
    total: 2,
    online: 0,
    offline: 2,
    unknown: 0,
    availabilityPct: 0,
    averageLatencyMs: null,
    activeIncidents: 2,
  },
}
const reports = hosts.map((h) => ({
  id: `incident-${h.id}`,
  hostId: h.id,
  deviceName: h.name,
  protocol: 'icmp',
  subject: 'Dispositivo',
  state: 'active',
  firstObservedAt: now,
  confirmedAt: now,
  endedAt: null,
  observedFailure: 'Sem resposta ICMP',
  cause: 'Não identificada',
  certainty: 'unidentified',
  evidence: [],
}))
test.beforeEach(async ({ page }) => {
  await page.route('**/api/monitor/status', (route) => route.fulfill({ json: snapshot }))
  await page.route('**/api/monitor/incidents', (route) => route.fulfill({ json: reports }))
  await page.route('**/api/topology', (route) =>
    route.fulfill({
      json: {
        revision: 1,
        graph: {
          nodes: hosts.map((h, i) => ({
            id: `node-${i}`,
            hostId: h.id,
            label: h.name,
            x: 24 + i * 400,
            y: 24,
            width: 200,
            height: 80,
            shape: 'rectangle',
            color: 'neutral',
          })),
          edges: [
            {
              id: 'ab',
              source: 'node-0',
              target: 'node-1',
              label: '',
              sourceSide: 'right',
              targetSide: 'left',
            },
          ],
        },
      },
    }),
  )
  await page.routeWebSocket('**/ws/status', () => {})
  await page.goto('/')
  await expect(page.getByText('Monitoramento ao vivo')).toBeVisible()
})
test('setor filtra cartões, incidentes e dispositivos do mapa', async ({ page }) => {
  await page.getByRole('combobox').first().selectOption('Garagem')
  await expect(page.getByRole('button', { name: /Dispositivo Administrativo/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Incidentes', exact: true }).click()
  await expect(page.locator('#monitor-incidents tbody tr')).toHaveCount(1)
  await expect(page.locator('#monitor-incidents tbody')).toContainText('Dispositivo Garagem')
  await page.getByRole('combobox').first().selectOption('Administrativo')
  await expect(page.locator('#monitor-incidents tbody tr')).toHaveCount(1)
  await expect(page.locator('#monitor-incidents tbody')).toContainText('Dispositivo Administrativo')
  await page.getByRole('combobox').first().selectOption('')
  await expect(page.locator('#monitor-incidents tbody tr')).toHaveCount(2)
  await page.getByRole('button', { name: 'Mapa', exact: true }).click()
  await page.getByRole('combobox').first().selectOption('Garagem')
  await expect(page.locator('#infrastructure-map')).not.toContainText('Dispositivo Administrativo')
})
test('Incidentes entra em tela cheia mesmo após visitar mapa e permite sair', async ({ page }) => {
  await page.getByRole('button', { name: 'Mapa', exact: true }).click()
  await page.getByRole('button', { name: 'Incidentes', exact: true }).click()
  await page.getByRole('button', { name: 'Modo TV / tela cheia' }).click()
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.id))
    .toBe('monitor-incidents')
  await page.getByRole('button', { name: 'Sair do modo TV' }).click()
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true)
  await expect(page.getByRole('button', { name: 'Incidentes', exact: true })).toBeVisible()
})
test('Escape sai da apresentação sem fullscreen nativo', async ({ page }) => {
  await page.evaluate(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new Error('Indisponível'))
  })
  await page.getByRole('button', { name: 'Incidentes', exact: true }).click()
  await page.getByRole('button', { name: 'Modo TV / tela cheia' }).click()
  await expect(page.getByRole('button', { name: 'Sair do modo TV' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Incidentes', exact: true })).toBeVisible()
})
test('marca única e pulso opcional respeitam movimento reduzido', async ({ page }) => {
  await expect(page.locator('header img')).toHaveAttribute('src', '/favicon.svg')
  await page.getByRole('button', { name: 'Mapa', exact: true }).click()
  const pulse = page.locator('path[pathLength="100"]')
  await expect(pulse).toHaveCount(1)
  await expect(pulse).toHaveCSS('animation-name', /edgeSignal/)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(pulse).toHaveCSS('display', 'none')
  await page.getByRole('button', { name: 'Pulsos ativados' }).click()
  await expect(pulse).toHaveCount(0)
  await page.reload()
  await page.getByRole('button', { name: 'Mapa', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pulsos desativados' })).toBeVisible()
})

test('janela administrativa mostra 512 caracteres e solicita cópia explícita', async ({ page }) => {
  const dummy = '0123456789abcdef'.repeat(32)
  await page.addInitScript((key) => {
    const commands: string[] = []
    Object.assign(window, {
      testCommands: commands,
      __TAURI__: {
        core: {
          invoke: async (command: string) => {
            commands.push(command)
            return command === 'read_admin_key' ? key : undefined
          },
        },
      },
    })
  }, dummy)
  for (const file of ['admin-key.html', 'admin-key.css', 'admin-key.js']) {
    await page.route(`**/${file}`, (route) => route.fulfill({ path: `desktop/ui/${file}` }))
  }
  await page.goto('/admin-key.html')
  await expect(page.getByRole('textbox', { name: 'Chave administrativa' })).toHaveValue(dummy)
  await page.getByRole('button', { name: 'Copiar chave' }).click()
  await expect(page.getByRole('status')).toContainText('Chave completa copiada')
  await page.getByRole('button', { name: 'Fechar' }).click()
  expect(
    await page.evaluate(() => (window as unknown as { testCommands: string[] }).testCommands),
  ).toEqual(['read_admin_key', 'copy_admin_key', 'close_admin_key'])
})
