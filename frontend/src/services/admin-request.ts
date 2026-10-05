import './admin-access.css'
let adminKey = ''
let pending: Promise<string | null> | null = null
export const forgetAdminKey = () => { adminKey = '' }
function requestKey(): Promise<string | null> {
  if (pending) return pending
  pending = new Promise<string | null>(resolve => {
    const dialog = document.createElement('dialog'), form = document.createElement('form')
    dialog.className = 'admin-access'; dialog.setAttribute('aria-label', 'Acesso administrador')
    const title = document.createElement('h2'); title.textContent = 'Acesso administrador'
    const explanation = document.createElement('p'); explanation.textContent = 'Informe a chave exibida no terminal do backend. Ela ficará somente na memória desta página.'
    const label = document.createElement('label'); label.textContent = 'Chave de administrador'
    const input = document.createElement('input'); input.type = 'password'; input.required = true; input.autocomplete = 'off'; input.maxLength = 512; label.append(input)
    const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = 'Continuar'
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancelar'
    let settled = false
    const finish = (key: string | null) => { if (settled) return; settled = true; input.value = ''; dialog.close(); dialog.remove(); resolve(key) }
    form.addEventListener('submit', event => { event.preventDefault(); finish(input.value.trim() || null) })
    cancel.addEventListener('click', () => finish(null)); dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null) })
    form.append(title, explanation, label, submit, cancel); dialog.append(form); document.body.append(dialog); dialog.showModal(); input.focus()
  }).finally(() => { pending = null })
  return pending
}
/** Keep credentials in memory, never localStorage, URLs, exports or the saved map. */
export async function adminRequest(url: string, options: RequestInit): Promise<Response> {
  const send = () => fetch(url, { ...options, signal: AbortSignal.timeout(30000), headers: { ...options.headers, ...(adminKey && { Authorization: `Bearer ${adminKey}` }) } })
  const attemptedKey = adminKey
  let response = await send()
  if (response.status !== 401) return response
  if (adminKey === attemptedKey) adminKey = ''
  if (!adminKey) {
    const entered = await requestKey()
    if (!entered) throw new Error('Operação cancelada: chave de administrador não informada')
    adminKey = entered
  }
  response = await send()
  if (response.status === 401) adminKey = ''
  return response
}
