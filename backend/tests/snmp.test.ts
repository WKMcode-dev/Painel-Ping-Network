import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSocket, type Socket } from 'node:dgram'
import { once } from 'node:events'
import snmp from 'net-snmp'
import { probeSnmp } from '../src/services/snmp.service.js'

test('SNMPv2c and SNMPv3 query a local UDP agent and never return credentials', async () => {
  // Reserva uma porta UDP para não exigir privilégios nem depender da porta 161.
  const reserve = createSocket('udp4')
  reserve.bind(0, '127.0.0.1'); await once(reserve, 'listening')
  const port = reserve.address().port
  await new Promise<void>(resolve => reserve.close(() => resolve()))
  const secret = 'integration-secret-only'
  const agent = snmp.createAgent({ port, address: '127.0.0.1' }, () => {})
  const socket = Object.values((agent as unknown as { listener: { sockets: Record<string, Socket> } }).listener.sockets)[0]!
  await once(socket, 'listening')
  const mib = agent.getMib()
  mib.registerProvider({ name: 'uptime', type: snmp.MibProviderType.Scalar,
    oid: '1.3.6.1.2.1.1.3', scalarType: snmp.ObjectType.TimeTicks, maxAccess: snmp.MaxAccess['read-only'] })
  mib.setScalarValue('uptime', 12345)
  mib.registerProvider({ name: 'interfaces', type: snmp.MibProviderType.Table,
    oid: '1.3.6.1.2.1.2.2.1', maxAccess: snmp.MaxAccess['read-only'],
    tableColumns: [
      { number: 1, name: 'index', type: snmp.ObjectType.Integer, maxAccess: snmp.MaxAccess['read-only'] },
      { number: 2, name: 'description', type: snmp.ObjectType.OctetString, maxAccess: snmp.MaxAccess['read-only'] },
      { number: 7, name: 'admin', type: snmp.ObjectType.Integer, maxAccess: snmp.MaxAccess['read-only'] },
      { number: 8, name: 'oper', type: snmp.ObjectType.Integer, maxAccess: snmp.MaxAccess['read-only'] },
    ], tableIndex: [{ columnName: 'index' }] })
  mib.addTableRow('interfaces', [7, 'port7', 2, 2])
  agent.getAuthorizer().addCommunity(secret)
  agent.getAuthorizer().addUser({ name: 'observer', level: snmp.SecurityLevel.authPriv,
    authProtocol: snmp.AuthProtocols.sha256, authKey: secret,
    privProtocol: snmp.PrivProtocols.aes, privKey: secret })
  try {
    for (const profile of [
      { version: '2c', community: secret },
      { version: '3', username: 'observer', authPassword: secret, privPassword: secret },
    ]) {
      process.env.SNMP_PROFILE_INTEGRATION = JSON.stringify(profile)
      const result = await probeSnmp('127.0.0.1', { profile: 'INTEGRATION', port, interfaces: [7, 8] })
      assert.equal(result.status, 'available', JSON.stringify(result))
      assert.equal(result.uptimeTicks, 12345)
      assert.deepEqual(result.interfaces[0], { index: 7, name: 'port7', adminStatus: 2, operStatus: 2 })
      assert.equal(result.interfaces[1]!.operStatus, null)
      assert.equal(JSON.stringify(result).includes(secret), false)
    }
    process.env.SNMP_PROFILE_INTEGRATION = JSON.stringify({ version: '2c', community: 'wrong-secret' })
    const rejected = await probeSnmp('127.0.0.1', { profile: 'INTEGRATION', port, interfaces: [7] })
    assert.equal(rejected.status, 'unknown')
    assert.equal(JSON.stringify(rejected).includes('wrong-secret'), false)
  } finally {
    delete process.env.SNMP_PROFILE_INTEGRATION
    await new Promise<void>(resolve => agent.close(resolve))
  }
})
test('missing profile and forbidden destinations remain unknown', async () => {
  const config = { profile: 'NO_SUCH_PROFILE', port: 161, interfaces: [1] }
  assert.equal((await probeSnmp('127.0.0.1', config)).status, 'unknown')
  process.env.SNMP_PROFILE_NO_SUCH_PROFILE = JSON.stringify({ version: '2c', community: 'test' })
  try { assert.match((await probeSnmp('169.254.169.254', config)).error!, /não autorizado/) }
  finally { delete process.env.SNMP_PROFILE_NO_SUCH_PROFILE }
})
