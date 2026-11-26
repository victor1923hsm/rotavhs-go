import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { abrirArmazenamento, iniciarPersistencia, memoria } from '@/app/persistencia'
import { iniciarDinamica } from '@/app/dinamica'
import '@/styles/app.css'

const desenhar = () =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )

// Retoma a rota guardada antes de desenhar (Etapa 3). Se o armazenamento demorar, desenha mesmo assim.
iniciarDinamica() // DEMONSTRAÇÃO P3: origem pela posição, desvio e alerta de proximidade
const pronto = abrirArmazenamento()
  .then(iniciarPersistencia)
  .catch(async () => iniciarPersistencia(await memoria()))
Promise.race([pronto, new Promise((r) => setTimeout(r, 2500))]).finally(desenhar)
