/** A chave completa vai para o clipboard somente quando o usuário escolhe Copiar. */
async function showAdminKey(parent, key, { dialog, clipboard }) {
  if (
    typeof key !== 'string' ||
    key.length < 32 ||
    key.length > 512 ||
    [...key].some((c) => c.charCodeAt(0) < 33 || c.charCodeAt(0) > 126)
  )
    throw new Error('Chave local inválida')
  const result = await dialog.showMessageBox(parent, {
    type: 'info',
    title: 'Acesso administrativo',
    message: 'Chave administrativa local',
    // Linhas curtas evitam a elipse do título dos diálogos nativos do Windows.
    detail:
      key.match(/.{1,32}/g).join(String.fromCharCode(10)) +
      String.fromCharCode(10, 10) +
      'Clique em Copiar chave e cole no campo de acesso do painel.',
    buttons: ['Copiar chave', 'Fechar'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  })
  if (result.response === 0) await clipboard.writeText(key)
}
module.exports = { showAdminKey }
