const invoke = window.__TAURI__.core.invoke
const status = document.getElementById('status')
invoke('read_admin_key')
  .then((key) => {
    document.getElementById('key').value = key
    document.getElementById('copy').disabled = false
  })
  .catch(() => {
    status.textContent = 'Não foi possível consultar a chave local.'
  })
document.getElementById('copy').onclick = async () => {
  try {
    await invoke('copy_admin_key')
    status.textContent = 'Chave completa copiada.'
  } catch {
    status.textContent = 'Não foi possível copiar. Selecione a chave e use Ctrl + C.'
  }
}
document.getElementById('close').onclick = () => invoke('close_admin_key')
