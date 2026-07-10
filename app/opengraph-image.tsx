import { ImageResponse } from 'next/og'

export const alt = 'Dash Speed — Dashboard de vendas com análise em tempo real'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#07080d',
          gap: 36,
        }}
      >
        <div
          style={{
            display: 'flex',
            width: 168,
            height: 168,
            borderRadius: 38,
            background: 'linear-gradient(135deg, #00d4ff, #8b5cf6)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: 76, fontWeight: 900, color: '#07080d', letterSpacing: -2 }}>DS</span>
        </div>
        <div style={{ display: 'flex', fontSize: 80, fontWeight: 800, color: 'white', letterSpacing: -2 }}>
          Dash Speed
        </div>
        <div style={{ display: 'flex', fontSize: 32, color: '#94a3b8' }}>
          Dashboard de vendas com análise em tempo real
        </div>
      </div>
    ),
    { ...size },
  )
}
