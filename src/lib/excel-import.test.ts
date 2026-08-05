import { describe, expect, it } from 'vitest'
import { parseSpreadsheetFile } from './excel-import'

function csvFile(name: string, content: string): File {
  return new File([content], name, { type: 'text/csv' })
}

describe('parseSpreadsheetFile CSV', () => {
  it('mapeia Nome, Telefone e CPF por cabeçalho', async () => {
    const f = csvFile(
      'lista.csv',
      'Nome;Telefone;CPF\nMaria Silva;11987654321;52998224725\nJoão;21999887766;\n',
    )
    const r = await parseSpreadsheetFile(f)
    expect(r.error).toBeUndefined()
    expect(r.source).toBe('csv')
    expect(r.rows.length).toBeGreaterThanOrEqual(2)
    const maria = r.rows.find((x) => x.nome.includes('Maria'))
    expect(maria).toBeTruthy()
    expect(maria!.telefone).toMatch(/^55/)
    expect(maria!.cpf.replace(/\D/g, '').length).toBe(11)
    expect(maria!.selected).toBe(true)
  })

  it('funciona com cabeçalhos em inglês', async () => {
    const f = csvFile(
      'en.csv',
      'name,phone,cpf\nAna Costa,11911112222,11144477735\n',
    )
    const r = await parseSpreadsheetFile(f)
    expect(r.rows.length).toBeGreaterThanOrEqual(1)
    expect(r.rows[0]!.nome).toMatch(/Ana/i)
    expect(r.rows[0]!.telefone.startsWith('55')).toBe(true)
  })
})
