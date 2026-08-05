import type { ExtractedRow } from '@/types'
import { createId } from './id'

/** Sample OCR rows when Gemini key is missing or demo mode */
export function sampleExtractedRows(): ExtractedRow[] {
  const rows: Array<Omit<ExtractedRow, 'id' | 'selected'>> = [
    {
      nome: 'Maria Silva Santos',
      telefone: '11987654321',
      cpf: '52998224725',
      confidence: 0.94,
      uncertain: false,
    },
    {
      nome: 'João Pedro Oliveira',
      telefone: '21999887766',
      cpf: '39053344705',
      confidence: 0.88,
      uncertain: false,
    },
    {
      nome: 'Ana Beatriz Costa',
      telefone: '31988776655',
      cpf: '15350946056',
      confidence: 0.72,
      uncertain: true,
    },
    {
      nome: 'Carlos Eduardo Lima',
      telefone: '41977665544',
      cpf: '88641577947',
      confidence: 0.91,
      uncertain: false,
    },
    {
      nome: 'Fernanda Souza',
      telefone: '51966554433',
      cpf: '07148689001',
      confidence: 0.65,
      uncertain: true,
    },
    {
      nome: 'Roberto Alves',
      telefone: '61955443322',
      cpf: '23100299900',
      confidence: 0.85,
      uncertain: false,
    },
  ]

  return rows.map((r) => ({
    ...r,
    id: createId('row'),
    selected: true,
  }))
}
