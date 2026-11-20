import { describe, expect, it } from 'vitest'
import { linkNavegacao } from './navegar'
import type { Parada } from './parada'

const p = (extra: Partial<Parada> = {}): Parada => ({
  id: 'a', stop: 12, pacotes: ['x'], endereco: 'Rua Teste 1, 10', bairro: 'Bairro', semNumero: false, lat: -15.80012, lon: -47.90034, ...extra,
})

describe('Navegar (revisão 11): só o destino daquela parada vai no link', () => {
  it('Google Maps com a coordenada da parada, de carro', () => {
    expect(linkNavegacao(p(), 'google')).toBe('https://www.google.com/maps/dir/?api=1&destination=-15.800120,-47.900340&travelmode=driving')
  })
  it('Waze com a coordenada e navegação ligada', () => {
    expect(linkNavegacao(p(), 'waze')).toBe('https://waze.com/ul?ll=-15.800120,-47.900340&navigate=yes')
  })
  it('sem coordenada: usa o endereço escrito', () => {
    const s = p({ lat: Number.NaN, lon: Number.NaN, semCoordenada: true })
    expect(linkNavegacao(s, 'google')).toContain('destination=Rua%20Teste%201%2C%2010%2C%20Bairro')
    expect(linkNavegacao(s, 'waze')).toContain('q=Rua%20Teste%201%2C%2010')
  })
  it('o link não leva número da parada nem códigos de pacote', () => {
    const l = linkNavegacao(p({ pacotes: ['BR26000000101X'] }), 'google')
    expect(l).not.toContain('BR26')
    expect(l).not.toContain('stop')
  })
})
