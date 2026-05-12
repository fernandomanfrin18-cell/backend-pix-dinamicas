const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

const SHEETS_WEBHOOK = 'https://script.google.com/macros/s/AKfycbyc9gej-9CH6ZPPSvQ7CONncxGRtbeXy4Qy6cUmN5iLXo2Yau9RtxhdPmaXScbWdFSC9w/exec';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const pagamentos = {};

function salvarNaPlanilha(dados) {
  try {
    const payload = JSON.stringify(dados);
    const url = new URL(SHEETS_WEBHOOK);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => console.log('[SHEETS] Resposta:', data));
    });
    req.on('error', err => console.error('[SHEETS] Erro:', err.message));
    req.write(payload);
    req.end();
  } catch (err) {
    console.error('[SHEETS] Erro ao salvar:', err.message);
  }
}

app.get('/health', (req, res) => {
  res.json({ ok: true, pagamentos_confirmados: Object.keys(pagamentos).length });
});

app.post('/registrar-cliente', (req, res) => {
  try {
    const { transaction_id, nome, email, whatsapp, plano, valor } = req.body;
    if (!transaction_id) return res.status(400).json({ error: 'transaction_id obrigatorio' });
    pagamentos[String(transaction_id)] = {
      status: 'pending',
      confirmed_at: null,
      cliente: { nome, email, whatsapp, plano, valor }
    };
    console.log('[CLIENTE] Registrado: ' + nome + ' | ' + whatsapp + ' | ' + plano + ' | tx: ' + transaction_id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/webhook', (req, res) => {
  try {
    const body = req.body;
    console.log('[WEBHOOK] Recebido:', JSON.stringify(body));
    const transactionId = body.transaction_id || body.id || body.order_id;
    const status = (body.status || '').toLowerCase();
    const pago = status === 'approved' || status === 'paid' || status === 'completed' || status === 'success';
    if (!transactionId) return res.status(200).json({ received: true });
    const registro = pagamentos[String(transactionId)] || { cliente: {} };
    if (pago) {
      registro.status = 'paid';
      registro.confirmed_at = new Date().toISOString();
      pagamentos[String(transactionId)] = registro;
      console.log('[WEBHOOK] PAGO: ' + transactionId);
      salvarNaPlanilha({
        transaction_id: transactionId,
        nome: registro.cliente.nome || '',
        email: registro.cliente.email || '',
        whatsapp: registro.cliente.whatsapp || '',
        plano: registro.cliente.plano || '',
        valor: registro.cliente.valor || '',
        status: 'confirmado'
      });
    } else {
      registro.status = status || 'pending';
      pagamentos[String(transactionId)] = registro;
      console.log('[WEBHOOK] PENDENTE: ' + transactionId + ' - ' + status);
    }
    res.status(200).json({ received: true, transaction_id: transactionId, status: registro.status });
  } catch (err) {
    console.error('[WEBHOOK] Erro:', err.message);
    res.status(200).json({ received: true, error: err.message });
  }
});

app.get('/status/:transaction_id', (req, res) => {
  const id = req.params.transaction_id;
  const r = pagamentos[String(id)];
  if (!r) return res.json({ transaction_id: id, status: 'pending', paid: false });
  res.json({ transaction_id: id, status: r.status, paid: r.status === 'paid', confirmed_at: r.confirmed_at });
});

app.get('/admin/pagamentos', (req, res) => {
  if (req.query.secret !== process.env.ADMIN_SECRET) return res.status(401).json({ error: 'Nao autorizado' });
  res.json(pagamentos);
});

app.listen(PORT, () => console.log('Backend PIX rodando na porta ' + PORT));
